// TEMPORARY diagnostic: reports how the page navigates (full load vs in-page)
// and adds a "DOM" button that copies a report to the clipboard.
(function() {
    if (!window.NavDebugBridge) return;

    const say = msg => { try { NavDebugBridge.log(msg); } catch (e) {} };
    const short = url => {
        try {
            const u = new URL(url, location.href);
            return (u.pathname + (u.search ? '?..' : '')).slice(0, 34);
        } catch (e) { return '?'; }
    };

    // ---- Navigation toasts -------------------------------------------------
    // This script runs once per full page load, so this line = a full load.
    let loadType = '?';
    try {
        const entry = performance.getEntriesByType('navigation')[0];
        if (entry) loadType = entry.type; // navigate | reload | back_forward
    } catch (e) {}
    say('CARGA COMPLETA (' + loadType + ') ' + short(location.href));

    if (window.navigation && typeof window.navigation.addEventListener === 'function') {
        window.navigation.addEventListener('navigate', e => {
            if (e.navigationType === 'replace') return; // too noisy
            const kind = e.destination && e.destination.sameDocument
                ? 'INTERNA' : 'saliendo a carga completa';
            const dir = e.navigationType === 'traverse' ? 'ATRAS' : e.navigationType;
            say(kind + ' ' + dir + ' -> ' + short(e.destination && e.destination.url));
        });
    } else {
        // Fallback for older WebViews.
        const push = history.pushState;
        history.pushState = function() {
            const result = push.apply(this, arguments);
            say('INTERNA push -> ' + short(location.href));
            return result;
        };
        window.addEventListener('popstate', () => say('INTERNA ATRAS -> ' + short(location.href)));
    }

    // ---- Collectors (cheap, always on) -------------------------------------
    const longTasks = [];
    try {
        new PerformanceObserver(list => {
            for (const e of list.getEntries()) longTasks.push(Math.round(e.duration));
        }).observe({ type: 'longtask', buffered: true });
    } catch (e) {}
    try { performance.setResourceTimingBufferSize(1500); } catch (e) {}

    // ---- Report -------------------------------------------------------------
    const MAX_NODES = 420;
    const MAX_DEPTH = 26;
    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'TEMPLATE']);

    const inViewport = el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight &&
            r.right > 0 && r.left < innerWidth;
    };

    const describe = el => {
        const tag = el.tagName.toLowerCase();
        const parts = [tag];
        const role = el.getAttribute('role');
        if (role) parts.push('role=' + role);
        for (const a of ['data-mcomponent', 'data-type', 'data-tti-phase', 'data-status-bar-color']) {
            const v = el.getAttribute(a);
            if (v !== null) parts.push(a.replace('data-', '') + '=' + v.slice(0, 18));
        }
        if (el.hasAttribute('data-tracking-duration-id')) parts.push('tracked');
        if (el.hasAttribute('data-focusable')) parts.push('focusable');
        const label = el.getAttribute('aria-label');
        if (label) parts.push('aria="' + label.slice(0, 22) + '"');
        const cls = (typeof el.className === 'string' ? el.className : '').trim();
        if (cls) parts.push('.' + cls.split(/\s+/).slice(0, 6).join('.'));
        return parts.join(' ');
    };

    const styleHints = el => {
        const out = [];
        try {
            const cs = getComputedStyle(el);
            const bg = cs.backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') out.push('bg=' + bg.replace(/ /g, ''));
            if (parseFloat(cs.borderTopLeftRadius) > 0) out.push('r=' + cs.borderTopLeftRadius);
            if (cs.borderBottomWidth !== '0px' && cs.borderBottomStyle !== 'none') {
                out.push('bb=' + cs.borderBottomWidth + ' ' + cs.borderBottomColor.replace(/ /g, ''));
            }
            if (cs.backgroundImage && cs.backgroundImage !== 'none') out.push('bgimg');
        } catch (e) {}
        return out.join(' ');
    };

    const leafText = el => {
        if (el.children.length) return '';
        const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
        if (!t) return '';
        let font = '';
        try {
            const cs = getComputedStyle(el);
            font = ' [' + cs.fontSize + '/' + cs.fontWeight + ' ' + cs.color.replace(/ /g, '') + ']';
        } catch (e) {}
        return ' "' + t.slice(0, 26) + '"' + font;
    };

    const imgState = img => {
        const size = Math.round(img.getBoundingClientRect().width) + 'x' + Math.round(img.getBoundingClientRect().height);
        const state = img.complete ? (img.naturalWidth > 0 ? 'ok' : 'FALLO') : 'pendiente';
        return 'img ' + state + ' ' + size + (img.loading === 'lazy' ? ' lazy' : '');
    };

    const tree = () => {
        const lines = [];
        let count = 0;
        const walk = (el, depth) => {
            const kids = Array.from(el.children).filter(k => !SKIP.has(k.tagName) && inViewport(k));
            let prevSig = null, prevIdx = -1, repeat = 1;
            for (const kid of kids) {
                if (count >= MAX_NODES || depth > MAX_DEPTH) return;
                const isImg = kid.tagName === 'IMG';
                const sig = isImg ? 'img' : describe(kid);
                if (sig === prevSig) {
                    repeat++;
                    lines[prevIdx] = lines[prevIdx].replace(/( x\d+)?$/, ' x' + repeat);
                    continue;
                }
                prevSig = sig; repeat = 1;
                const hints = isImg ? '' : styleHints(kid);
                const line = '  '.repeat(depth) + (isImg ? imgState(kid) : sig) +
                    (hints ? ' {' + hints + '}' : '') + (isImg ? '' : leafText(kid));
                prevIdx = lines.push(line) - 1;
                count++;
                if (kid.tagName !== 'SVG' && kid.tagName.toLowerCase() !== 'svg' && !isImg) walk(kid, depth + 1);
            }
        };
        walk(document.body, 0);
        return lines;
    };

    const healthReport = () => {
        const out = [];
        const imgs = Array.from(document.images);
        const loaded = imgs.filter(i => i.complete && i.naturalWidth > 0).length;
        const failed = imgs.filter(i => i.complete && i.naturalWidth === 0).length;
        const pending = imgs.filter(i => !i.complete).length;
        const lazy = imgs.filter(i => i.loading === 'lazy').length;
        out.push('IMAGENES: total=' + imgs.length + ' ok=' + loaded + ' fallo=' + failed +
            ' pendientes=' + pending + ' lazy=' + lazy);
        out.push('FONDOS CSS (background-image inline): ' + document.querySelectorAll('[style*="background-image"]').length);

        const res = performance.getEntriesByType('resource');
        const byType = {};
        res.forEach(r => { byType[r.initiatorType] = (byType[r.initiatorType] || 0) + 1; });
        out.push('RECURSOS: total=' + res.length + ' por tipo=' + JSON.stringify(byType));
        const bad = res.filter(r => r.responseStatus >= 400);
        out.push('RECURSOS CON ERROR HTTP: ' + bad.length);
        bad.slice(0, 6).forEach(r => out.push('  ' + r.responseStatus + ' ' + r.initiatorType + ' ' + short(r.name)));
        const slow = res.filter(r => r.duration > 0).sort((a, b) => b.duration - a.duration).slice(0, 8);
        out.push('MAS LENTOS:');
        slow.forEach(r => out.push('  ' + Math.round(r.duration) + 'ms ' + r.initiatorType + ' ' +
            (r.transferSize ? Math.round(r.transferSize / 1024) + 'KB ' : '') + short(r.name)));

        const lt = longTasks;
        const ltTotal = lt.reduce((a, b) => a + b, 0);
        out.push('TAREAS LARGAS (>50ms): n=' + lt.length + ' total=' + ltTotal + 'ms max=' +
            (lt.length ? Math.max.apply(null, lt) : 0) + 'ms');
        const s = window.__nbStats;
        if (s) {
            out.push('NUESTROS SCRIPTS: ' + s.flushes + ' ejecuciones, ' + Math.round(s.totalMs) +
                'ms en total, max ' + Math.round(s.maxMs) + 'ms');
        }
        out.push('TIEMPO DESDE LA CARGA: ' + Math.round(performance.now()) + 'ms');
        return out;
    };

    const buildReport = () => {
        const head = [
            'NOBOOK INFORME',
            'url=' + short(location.href) + ' viewport=' + innerWidth + 'x' + innerHeight +
                ' dpr=' + devicePixelRatio + ' scrollY=' + Math.round(scrollY),
            'theme-color=' + ((document.querySelector('meta[name="theme-color"]') || {}).content || 'none'),
            ''
        ];
        const lines = head.concat(healthReport(), ['', 'ESTRUCTURA VISIBLE:'], tree());
        return lines.join('\n');
    };

    window.__nbReport = buildReport;

    // ---- Floating button ----------------------------------------------------
    const BUTTON_ID = 'nb-probe-button';
    const ensureButton = () => {
        if (document.getElementById(BUTTON_ID) || !document.body) return;
        const b = document.createElement('button');
        b.id = BUTTON_ID;
        b.textContent = 'DOM';
        b.style.cssText = 'position:fixed;right:8px;bottom:96px;width:46px;height:46px;' +
            'border-radius:50%;border:0;background:rgba(110,40,200,.8);color:#fff;' +
            'font:700 12px sans-serif;z-index:2147483647;';
        b.addEventListener('click', e => {
            e.stopPropagation();
            try {
                const report = buildReport();
                NavDebugBridge.copy(report);
            } catch (err) {
                say('Error al crear el informe: ' + err.message);
            }
        });
        document.body.appendChild(b);
    };
    ensureButton();
    if (typeof window.nbSubscribe === 'function') window.nbSubscribe(ensureButton);
})();
