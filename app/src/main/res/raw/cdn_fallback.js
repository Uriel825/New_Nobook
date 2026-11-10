// CDN fallback.
//
// Facebook serves photos and video segments from several nodes of the same
// cluster (scontent.ftlc1-1..., scontent.ftlc1-2..., same content). From some
// networks one node answers in 30+ seconds or never, while its sibling is
// instant: images stay blank and reels wait. When an image stays pending, this
// script asks the sibling node for the same file first (a detached probe), and
// only swaps it into the page if the probe loads. Media fetches to a node that
// is known to be slow go to the sibling first and fall back to the original.
//
// Safety: nothing is touched on hosts that answer normally, and the whole
// thing switches itself off if the sibling keeps failing and never succeeds.
(function () {
    const cfg = Object.assign({
        stallMs: 3500,        // a pending image older than this is "stalled"
        slowGraceMs: 1200,    // for a host already known to be slow
        tickMs: 700,          // scan period while images are waiting
        maxProbes: 6,         // simultaneous probes
        maxFailsToDisable: 3  // failures with no success before switching off
    }, window.__nbCdnTest || {});

    const stats = window.__nbCdn = {
        probes: 0, rescued: 0, failed: 0,
        fetchSwapped: 0, fetchOk: 0, fetchFailed: 0,
        disabled: false, slow: []
    };

    const slow = new Set();     // hosts with stalled images
    const records = new WeakMap(); // img -> { url, since, state }
    const swapped = new WeakMap(); // img -> the sibling URL we put there (never counts as stalled)
    let okCount = {};           // host -> images fully loaded right now
    let inflight = 0;
    let timer = null;

    const hostOf = u => { try { return new URL(u, location.href).host; } catch (e) { return ''; } };
    const isMedia = h => /^scontent[.-]/.test(h) && /\.fbcdn\.net$/.test(h);
    // scontent.ftlc1-1.fna.fbcdn.net and ...ftlc1-2... share the same cluster key.
    const clusterOf = h => h.replace(/-\d+\./, '.');
    const swapHost = (url, from, to) => url.replace('//' + from + '/', '//' + to + '/');

    const maybeDisable = () => {
        if (stats.rescued + stats.fetchOk === 0 &&
            stats.failed + stats.fetchFailed >= cfg.maxFailsToDisable) {
            stats.disabled = true;
        }
    };

    // A healthy sibling of the same cluster that already delivered images.
    const pickAlt = host => {
        if (stats.disabled) return null;
        const key = clusterOf(host);
        let best = null, bestN = 0;
        for (const h in okCount) {
            if (h !== host && !slow.has(h) && isMedia(h) && clusterOf(h) === key && okCount[h] > bestN) {
                best = h; bestN = okCount[h];
            }
        }
        return best;
    };

    const schedule = () => {
        if (timer === null && !stats.disabled) timer = setTimeout(scan, cfg.tickMs);
    };

    function scan() {
        timer = null;
        if (stats.disabled) return;
        const now = Date.now();
        const fresh = {};
        const pending = [];
        const imgs = document.images;

        for (let i = 0; i < imgs.length; i++) {
            const img = imgs[i];
            const url = img.currentSrc || img.src;
            if (!url || url.indexOf('data:') === 0) continue;
            const host = hostOf(url);
            if (!isMedia(host)) continue;
            if (img.complete) {
                if (img.naturalWidth > 0) fresh[host] = (fresh[host] || 0) + 1;
                continue;
            }
            // Images we already moved to the sibling are loading from cache: leave them alone.
            if (swapped.get(img) === url) continue;
            let rec = records.get(img);
            if (!rec || rec.url !== url) {
                rec = { url: url, since: now, state: 'wait' };
                records.set(img, rec);
            }
            pending.push({ img: img, rec: rec, host: host, url: url, age: now - rec.since });
        }
        okCount = fresh;

        // A host with two or more stalled images is considered slow.
        const stalled = {};
        pending.forEach(p => { if (p.age > cfg.stallMs) stalled[p.host] = (stalled[p.host] || 0) + 1; });
        for (const h in stalled) if (stalled[h] >= 2) slow.add(h);
        stats.slow = Array.from(slow);

        let waiting = false;
        pending.forEach(p => {
            if (p.rec.state !== 'wait') return;
            const limit = slow.has(p.host) ? cfg.slowGraceMs : cfg.stallMs;
            waiting = true;
            if (p.age <= limit) return;
            if (p.img.srcset) { p.rec.state = 'skip'; return; }
            if (inflight >= cfg.maxProbes) return;
            const altHost = pickAlt(p.host);
            if (!altHost) return;

            const alt = swapHost(p.url, p.host, altHost);
            p.rec.state = 'probing';
            inflight++;
            stats.probes++;
            const probe = new Image();
            probe.onload = () => {
                inflight--;
                p.rec.state = 'done';
                // Only swap if the page did not change this image meanwhile.
                if ((p.img.currentSrc || p.img.src) === p.url) {
                    p.img.src = alt;
                    swapped.set(p.img, p.img.src);
                    stats.rescued++;
                }
            };
            probe.onerror = () => {
                inflight--;
                p.rec.state = 'failed';
                stats.failed++;
                maybeDisable();
            };
            probe.src = alt;
        });

        if (waiting) schedule();
    }

    // Media fetches (video segments) to a slow node go to its sibling first.
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
        window.fetch = function (input, init) {
            try {
                if (!stats.disabled && slow.size) {
                    const isReq = typeof Request === 'function' && input instanceof Request;
                    const url = isReq ? input.url : String(input);
                    const method = String((init && init.method) || (isReq && input.method) || 'GET').toUpperCase();
                    const host = method === 'GET' ? hostOf(url) : '';
                    const altHost = host && slow.has(host) ? pickAlt(host) : null;
                    if (altHost) {
                        stats.fetchSwapped++;
                        const self = this, args = arguments;
                        const alt = swapHost(url, host, altHost);
                        return origFetch.call(self, isReq ? new Request(alt, input) : alt, init).then(
                            res => {
                                if (res.ok) { stats.fetchOk++; return res; }
                                stats.fetchFailed++; maybeDisable();
                                return origFetch.apply(self, args);
                            },
                            () => {
                                stats.fetchFailed++; maybeDisable();
                                return origFetch.apply(self, args);
                            }
                        );
                    }
                }
            } catch (e) {}
            return origFetch.apply(this, arguments);
        };
    }

    if (typeof window.nbSubscribe === 'function') window.nbSubscribe(schedule);
    schedule();
})();
