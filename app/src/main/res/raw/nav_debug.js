// TEMPORARY diagnostic: reports how the page navigates (full load vs in-page).
(function() {
    if (!window.NavDebugBridge) return;

    const say = msg => { try { NavDebugBridge.log(msg); } catch (e) {} };
    const short = url => {
        try {
            const u = new URL(url, location.href);
            return (u.pathname + (u.search ? '?..' : '')).slice(0, 34);
        } catch (e) { return '?'; }
    };

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
})();
