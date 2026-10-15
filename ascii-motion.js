/* Shared motion math for the canvas renderer and its Node regression tests. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AsciiMotion = api;
})(typeof window === 'object' ? window : globalThis, function () {
    const clamp = value => Math.max(0, Math.min(1, value));
    // Matches the fluid root font above 1920px, with height limiting ultrawides.
    function layoutScale(width, height) {
        return Math.max(1, Math.min(2.5, (width - 640) / 1280, (height - 360) / 720));
    }
    function hash(seed, salt = 0) {
        let n = Math.imul(seed + 1, 2654435761) ^ Math.imul(salt + 7, 40503);
        n = Math.imul(n ^ (n >>> 15), 2246822519);
        return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
    }
    function createTween(from, to, start, duration = 3200) {
        return { from, to, start, duration: duration * Math.abs(to - from) };
    }
    function valueAt(tween, now) {
        if (!tween.duration) return tween.to;
        const p = clamp((now - tween.start) / tween.duration);
        return tween.from + (tween.to - tween.from) * Math.sin(p * Math.PI / 2);
    }
    function retarget(tween, to, now, duration = 3200) {
        return tween.to === to ? tween : createTween(valueAt(tween, now), to, now, duration);
    }
    function stageAt(y, stage, boundaries) {
        while (stage < boundaries.length && y >= boundaries[stage].forward) stage++;
        while (stage > 0 && y <= boundaries[stage - 1].backward) stage--;
        return stage;
    }
    function sectionBoundaries({ solutionsTop, solutionsBottom, arrowEnd, diplomaReturn, footerTop, footerStart, viewportHeight }) {
        const footerArrival = footerStart ?? footerTop - viewportHeight * 0.60;
        return [
            {
                forward: solutionsTop - viewportHeight * 0.35,
                backward: Math.min(diplomaReturn ?? solutionsTop - viewportHeight * 0.55, solutionsTop - viewportHeight * 0.55),
            },
            {
                forward: footerArrival,
                backward: Math.min(arrowEnd ?? solutionsBottom - viewportHeight * 0.55, footerArrival - viewportHeight * 0.2),
            },
        ];
    }
    function showcaseRect(rect, scrollY, end) {
        const top = Math.min(rect.top, end - scrollY);
        return { left: rect.left, top, bottom: top + rect.height, width: rect.width, height: rect.height };
    }
    function makeCouriers(from, to) {
        if (!from.length || !to.length) return [];
        const order = cells => cells.map((cell, i) => ({ i, key: -cell.y + (hash(i, 19) - 0.5) * 90 }))
            .sort((a, b) => a.key - b.key).map(cell => cell.i);
        const a = order(from), b = order(to), count = Math.max(a.length, b.length);
        let lastFrom = -1, lastTo = -1;
        return Array.from({ length: count }, (_, i) => {
            const source = a[Math.floor(i * a.length / count)];
            const destination = b[Math.floor(i * b.length / count)];
            const trip = 0.45 + hash(i, 3) * 0.4;
            const courier = {
                from: source, to: destination,
                alphaFrom: source === lastFrom ? 0 : from[source].alpha,
                alphaTo: destination === lastTo ? 0 : to[destination].alpha,
                start: Math.max(0, Math.min(1 - trip, i / count * (1 - trip) + (hash(i, 5) - 0.5) * 0.08)),
                trip, bendX: (hash(i, 7) + hash(i, 8) - 1) * 150,
                bendY: (hash(i, 9) - 0.5) * 140, phase: hash(i, 10) * Math.PI * 2,
            };
            lastFrom = source;
            lastTo = destination;
            return courier;
        });
    }
    const cellProgress = (courier, progress) => clamp((progress - courier.start) / courier.trip);
    function curvePoint(from, to, bend, p) {
        const t = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
        const cx = (from.x + to.x) / 2 + bend.x;
        const cy = (from.y + to.y) / 2 + bend.y;
        return {
            x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * cx + t * t * to.x,
            y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * cy + t * t * to.y,
        };
    }
    function pixelRatio(width, height, dpr = 1) {
        return Math.min(dpr || 1, 3, Math.sqrt(1500000 / Math.max(1, width * height)));
    }
    function rasterSize(width, height, deviceScale = 1) {
        width = Math.max(1, Math.round(width));
        height = Math.max(1, Math.round(height));
        const dpr = pixelRatio(width, height, deviceScale);
        return { width, height, dpr, pixelWidth: Math.round(width * dpr), pixelHeight: Math.round(height * dpr) };
    }
    function wave(depth, now, phase) {
        const centre = -0.1 + ((now / 7000 + phase) % 1) * 1.2;
        const distance = Math.abs(depth - centre) / 0.1;
        return distance >= 1 ? 0 : (1 + Math.cos(Math.PI * distance)) / 2;
    }
    function flightEndpoint(point, height, phase = 0) {
        const reach = 90 + (Math.sin(phase) + 1) * 70;
        let y = point.y;
        if (y < -30) y = -30 - reach * (1 - Math.exp((y + 30) / reach));
        if (y > height + 30) y = height + 30 + reach * (1 - Math.exp(-(y - height - 30) / reach));
        return { x: point.x, y };
    }
    function afkPulse(idleFor) {
        if (idleFor < 5500) return 0;
        const local = (idleFor - 5500) % 10200;
        if (local < 2800) {
            const p = local / 2800;
            return Math.sin(p * Math.PI / 2) ** 2;
        }
        if (local < 5800) {
            return 1;
        }
        if (local < 7400) {
            const p = (local - 5800) / 1600;
            return Math.cos(p * Math.PI / 2) ** 2;
        }
        return 0;
    }
    function deformOffset(cell, amount, spread) {
        return {
            x: (hash(cell.seed, 81) - 0.5) * spread * 2 * amount,
            y: (hash(cell.seed, 82) - 0.5) * spread * 1.4 * amount,
        };
    }
    return { clamp, layoutScale, hash, createTween, valueAt, retarget, stageAt, sectionBoundaries, showcaseRect, makeCouriers, cellProgress, curvePoint, pixelRatio, rasterSize, wave, flightEndpoint, afkPulse, deformOffset };
});
