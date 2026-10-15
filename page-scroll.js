/* Keep wheel travel and pinned animations on the same GSAP clock. */
(function () {
    function setup() {
        if (!window.Lenis || !window.gsap || !window.ScrollTrigger) return;
        const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
        let scroll, tick;
        function update() {
            if (scroll) {
                window.gsap.ticker.remove(tick);
                window.ScrollTrigger.removeEventListener('refresh', resize);
                scroll.destroy();
                scroll = null;
                window.lexiconScroll = null;
            }
            if (preference.matches) return;
            scroll = new window.Lenis({
                lerp: 0.12,
                smoothWheel: true,
                syncTouch: false,
                anchors: true,
                autoRaf: false,
            });
            tick = seconds => scroll.raf(seconds * 1000);
            scroll.on('scroll', window.ScrollTrigger.update);
            window.ScrollTrigger.addEventListener('refresh', resize);
            window.gsap.ticker.add(tick);
            window.gsap.ticker.lagSmoothing(0);
            window.lexiconScroll = scroll;
        }
        function resize() { scroll?.resize(); }
        preference.addEventListener('change', update);
        window.addEventListener('pageshow', resize);
        update();
        document.fonts.ready.then(() => requestAnimationFrame(() => window.ScrollTrigger.refresh()));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
    else setup();
})();
