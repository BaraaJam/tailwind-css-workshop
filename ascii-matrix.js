/* Render travel once, then project it into each section's background layer. */
(function () {
    const M = window.AsciiMotion;
    const FONT = '"Lexicon Matrix", ui-monospace, monospace';
    const CONFIG = [
        { id: 'features-matrix-canvas', shape: 'diploma', seed: 4 },
        { id: 'solutions-matrix-canvas', shape: 'arrow', seed: 2 },
        { id: 'bottom-matrix-canvas', shape: 'question', seed: 3, dark: true },
    ];
    const mix = (a, b, p) => a.map((value, i) => Math.round(value + (b[i] - value) * p));

    class AsciiScene {
        constructor() {
            this.surfaces = CONFIG.map(options => new window.AsciiArtwork(document.getElementById(options.id), options));
            this.hero = new window.AsciiArtwork(document.getElementById('hero-matrix-canvas'), { shape: 'cap', seed: 1, static: true });
            const footerCanvas = document.getElementById('footer-logo-matrix-canvas');
            this.footerLogo = footerCanvas ? new window.AsciiArtwork(footerCanvas, { shape: 'logo', seed: 5, static: true }) : null;
            this.artworks = [this.hero, ...this.surfaces, ...(this.footerLogo ? [this.footerLogo] : [])];
            this.canvas = document.createElement('canvas');
            if (typeof document === 'object' && document.body && typeof document.body.appendChild === 'function') {
                this.canvas.className = 'ascii-global-flight-layer';
                this.canvas.setAttribute('aria-hidden', 'true');
                this.canvas.style.pointerEvents = 'none';
                this.canvas.style.position = 'fixed';
                this.canvas.style.inset = '0';
                this.canvas.style.width = '100vw';
                this.canvas.style.height = '100vh';
                this.canvas.style.zIndex = '35';
                document.body.appendChild(this.canvas);
            }
            this.ctx = this.canvas.getContext('2d');
            this.stage = 0;
            this.targetStage = 0;
            this.activeRelay = null;
            this.raf = 0;
            this.timer = 0;
            this.layoutDirty = true;
            this.destroyed = false;
            this.ready = false;
            this.preference = window.matchMedia('(prefers-reduced-motion: reduce)');
            this.lastInteraction = performance.now();
            this.events = new AbortController();
            this.wake = () => this.requestFrame();
            this.onLayout = () => { this.layoutDirty = true; this.requestFrame(); };
            this.onInput = () => { this.lastInteraction = performance.now(); this.requestFrame(); };
            this.onScroll = () => { this.lastInteraction = performance.now(); this.onLayout(); };
            this.onVisibility = () => document.hidden ? this.cancelFrame() : this.onLayout();
            this.onPreference = () => {
                if (this.ready && this.preference.matches) {
                    this.settle(this.targetStage);
                    this.hero.paintFull();
                }
                this.requestFrame();
            };
            const signal = this.events.signal;
            window.addEventListener('scroll', this.onScroll, { passive: true, signal });
            for (const event of ['pointermove', 'pointerdown', 'keydown', 'touchstart']) window.addEventListener(event, this.onInput, { passive: true, signal });
            window.addEventListener('resize', this.onLayout, { signal });
            window.addEventListener('pageshow', this.onLayout, { signal });
            window.addEventListener('pagehide', event => { if (!event.persisted) this.destroy(); }, { signal });
            document.addEventListener('visibilitychange', this.onVisibility, { signal });
            this.preference.addEventListener('change', this.onPreference);
            this.resizeObserver = new ResizeObserver(this.onLayout);
            this.observer = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    const surface = this.artworks.find(item => item.canvas === entry.target);
                    surface.isVisible = entry.isIntersecting;
                }
                this.requestFrame();
            }, { rootMargin: '10% 0px' });
            for (const surface of this.artworks) {
                this.resizeObserver.observe(surface.canvas.parentElement);
                this.observer.observe(surface.canvas);
            }
            window.ScrollTrigger?.addEventListener('refresh', this.onLayout);
            this.start();
        }

        async start() {
            try {
                await Promise.all([
                    ...this.artworks.map(surface => surface.ready),
                    window.AsciiArtwork.loadFont(),
                ]);
                if (this.destroyed) return;
                this.measure();
                this.targetStage = M.stageAt(window.scrollY, 0, this.boundaries);
                this.stage = this.targetStage;
                this.hasEntered = this.stage !== 0;
                this.ready = true;
                this.hero.paintFull();
                if (this.footerLogo) this.footerLogo.paintFull();
                this.settle(this.stage);
                this.requestFrame();
            } catch (error) {
                console.error('Could not load the ASCII artwork.', error);
                this.destroy();
            }
        }

        measure() {
            // Read geometry together before rebuilding any canvas backing stores.
            const rects = this.artworks.map(surface => surface.canvas.getBoundingClientRect());
            const track = document.getElementById('solutions-scroll-track').getBoundingClientRect();
            const hero = window.ScrollTrigger?.getById('hero-stage');
            const heading = document.getElementById('features-headline').getBoundingClientRect();
            const mobile = rects[1].width < 768;
            const diplomaRatio = this.surfaces[0].image.naturalWidth / this.surfaces[0].image.naturalHeight;
            const diplomaHeight = Math.round(Math.min(rects[1].height * (mobile ? 0.28 : 0.34), mobile ? 220 : 280, rects[1].width * 0.35));
            const diplomaWidth = Math.round(diplomaHeight * diplomaRatio);
            const diplomaX = Math.round(mobile ? rects[1].width * 0.05 : Math.max(30, (rects[1].width - 1280) / 2 + 20));
            const diplomaY = Math.round(mobile ? Math.max(65, rects[1].height * 0.09) : Math.max(115, rects[1].height * 0.12));
            this.surfaces[0].artBounds = {
                x: diplomaX,
                y: diplomaY,
                width: diplomaWidth,
                height: diplomaHeight,
                rotation: -15 * Math.PI / 180,
            };
            let changed = false;
            this.artworks.forEach((surface, index) => {
                const resized = surface.resize(rects[index]);
                if (surface.options?.static) { if (resized) surface.paintFull(); }
                else changed = resized || changed;
            });
            this.width = document.documentElement.clientWidth;
            this.height = window.innerHeight;
            const dpr = M.pixelRatio(this.width, this.height, window.devicePixelRatio);
            const width = Math.round(this.width * dpr), height = Math.round(this.height * dpr);
            if (this.canvas.width !== width || this.canvas.height !== height) {
                this.canvas.width = width;
                this.canvas.height = height;
            }
            this.dpr = dpr;
            const heroStart = hero?.start ?? 0;
            this.boundaries = M.sectionBoundaries({
                heroStart, heroEnd: hero?.end ?? this.height,
                solutionsTop: track.top + window.scrollY,
                solutionsBottom: track.bottom + window.scrollY,
                footerTop: rects[3].top + window.scrollY,
                viewportHeight: this.height,
            });
            this.layoutDirty = false;
            // A resize changes cell counts and atlas coordinates; settle before using new tiles.
            if (changed && this.ready) this.settle(M.stageAt(window.scrollY, this.targetStage, this.boundaries));
        }

        requestFrame() {
            if (this.destroyed || !this.ready || document.hidden || this.raf) return;
            clearTimeout(this.timer);
            this.timer = 0;
            this.raf = requestAnimationFrame(now => this.frame(now));
        }

        cancelFrame() {
            cancelAnimationFrame(this.raf);
            clearTimeout(this.timer);
            this.raf = 0;
            this.timer = 0;
        }

        point(surface, index) {
            const cell = surface.cells[index];
            if (surface.anchor) return { x: surface.anchor.rect.left + cell.x, y: surface.anchor.rect.top + cell.y };
            return surface.virtual
                ? { x: cell.x, y: cell.y - window.scrollY }
                : { x: surface.rect.left + cell.x, y: surface.rect.top + cell.y };
        }

        transfer(toIndex, now, source = this.surfaces[this.stage]) {
            const destination = this.surfaces[toIndex];
            const fromIndex = source.virtual ? -1 : this.surfaces.indexOf(source);
            const sourcePose = !source.virtual && source.deformAmount > 0 ? { amount: source.deformAmount, spread: source.deformSpread } : null;
            if (sourcePose) {
                const artwork = source;
                source = { virtual: true, anchor: artwork, cells: artwork.cells.map(cell => {
                    const offset = M.deformOffset(cell, sourcePose.amount, sourcePose.spread);
                    return { ...cell, x: cell.x + offset.x, y: cell.y + offset.y, alpha: cell.alpha * (1 - sourcePose.amount * 0.25) };
                }) };
            }
            this.hasEntered = true;
            // A short viewport may have no room for the diploma. Assemble the next
            // shape from scattered background cells rather than waiting on an empty relay.
            if (!destination.cells.length) { this.settle(toIndex); return; }
            if (!source.cells.length) {
                source = { virtual: true, cells: destination.cells.map((cell, i) => ({
                    ...cell, x: M.hash(i, 51) * this.width,
                    y: M.hash(i, 52) * this.height + window.scrollY, alpha: 0.2,
                })) };
            }
            for (const surface of this.surfaces) surface.clear();
            if (!source.virtual) source.paintFull();
            const couriers = M.makeCouriers(source.cells, destination.cells);
            const relay = {
                source, destination, fromIndex, toIndex, sourcePose,
                couriers, states: new Uint8Array(couriers.length),
                tween: M.createTween(0, 1, now), progress: 0,
                glyphs: couriers.map((_, i) => M.hash(i, 25) < 0.5 ? '0' : '1'),
                nextFlip: new Float64Array(couriers.length),
            };
            relay.tints = couriers.map(courier => Array.from({ length: 5 }, (_, i) => `rgb(${mix(source.cells[courier.from].rgb, destination.cells[courier.to].rgb, i / 4).join(',')})`));
            this.activeRelay = relay;
        }

        progress(relay, now) {
            return M.valueAt(relay.tween, now);
        }

        flightPoint(relay, courier, p, now) {
            const from = M.flightEndpoint(this.point(relay.source, courier.from), this.height, courier.phase);
            const to = M.flightEndpoint(this.point(relay.destination, courier.to), this.height, courier.phase);
            const point = M.curvePoint(from, to, { x: courier.bendX, y: courier.bendY }, p);
            const middle = Math.sin(p * Math.PI), time = now / 1000;
            point.x += Math.sin(courier.phase + time * 2.2) * 12 * middle;
            point.y += Math.cos(courier.phase + time * 1.8) * 8 * middle;
            return point;
        }

        snapshot(now) {
            const relay = this.activeRelay, progress = this.progress(relay, now);
            const cells = [];
            relay.couriers.forEach((courier, i) => {
                const p = M.cellProgress(courier, progress);
                const alpha = courier.alphaFrom + (courier.alphaTo - courier.alphaFrom) * p;
                if (alpha < 0.008) return;
                const point = this.flightPoint(relay, courier, p, now);
                cells.push({ x: point.x, y: point.y + window.scrollY, rgb: mix(relay.source.cells[courier.from].rgb, relay.destination.cells[courier.to].rgb, p), alpha, glyph: relay.glyphs[i] });
            });
            return { virtual: true, cells };
        }

        chooseTarget(now) {
            this.targetStage = M.stageAt(window.scrollY, this.targetStage, this.boundaries);
            if (this.preference.matches) {
                if (this.activeRelay || this.stage !== this.targetStage) this.settle(this.targetStage);
                return;
            }
            const relay = this.activeRelay;
            if (!relay) {
                if (this.stage !== this.targetStage) this.transfer(this.targetStage, now);
            } else if (relay.toIndex === this.targetStage) {
                relay.tween = M.retarget(relay.tween, 1, now);
            } else if (relay.fromIndex === this.targetStage) {
                relay.tween = M.retarget(relay.tween, 0, now);
            } else {
                // A jump to a third section starts from the particles' current positions.
                this.transfer(this.targetStage, now, this.snapshot(now));
            }
        }

        drawRelay(now) {
            const relay = this.activeRelay;
            relay.progress = this.progress(relay, now);
            const ctx = this.ctx;
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            ctx.clearRect(0, 0, this.width, this.height);
            ctx.font = `400 ${this.width < 768 ? 8 : 9}px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            relay.couriers.forEach((courier, i) => {
                const p = M.cellProgress(courier, relay.progress);
                const state = p <= 0 ? 0 : p >= 1 ? 2 : 1;
                const previous = relay.states[i];
                if (state !== previous) {
                    if (!relay.source.virtual && courier.alphaFrom > 0 && (state === 0 || previous === 0)) relay.source.paintCell(courier.from, state === 0);
                    if (courier.alphaTo > 0 && (state === 2 || previous === 2)) relay.destination.paintCell(courier.to, state === 2);
                    relay.states[i] = state;
                }
                if (state === 2 || (state === 0 && !relay.source.virtual)) return;
                const point = this.flightPoint(relay, courier, p, now);
                if (point.x < -30 || point.x > this.width + 30 || point.y < -30 || point.y > this.height + 30) return;
                const middle = Math.sin(p * Math.PI);
                if (now >= relay.nextFlip[i]) {
                    relay.glyphs[i] = Math.random() < 0.5 ? '0' : '1';
                    relay.nextFlip[i] = now + (45 + M.hash(i, 30) * 70) / Math.max(0.15, middle);
                }
                const alpha = courier.alphaFrom + (courier.alphaTo - courier.alphaFrom) * p;
                ctx.fillStyle = relay.tints[i][Math.round(p * 4)];
                if (this.width >= 768 && middle > 0.3) {
                    const ghost = this.flightPoint(relay, courier, Math.max(0, p - 0.045), now);
                    ctx.globalAlpha = alpha * 0.10;
                    ctx.fillText(relay.glyphs[i], ghost.x, ghost.y);
                }
                ctx.globalAlpha = Math.min(0.95, alpha + middle * 0.3);
                ctx.fillText(relay.glyphs[i], point.x, point.y);
            });
            ctx.globalAlpha = 1;
            for (const surface of this.surfaces) surface.paintFlight(this.canvas, this.width, this.height);
            const destination = relay.tween.to;
            if (relay.progress === destination) {
                this.lastInteraction = now;
                this.settle(destination === 1 ? relay.toIndex : relay.fromIndex, destination === 0 && relay.sourcePose ? { ...relay.sourcePose, now } : null);
            }
        }

        settle(index, pose = null) {
            this.stage = index;
            this.targetStage = index;
            this.activeRelay = null;
            for (let i = 0; i < this.surfaces.length; i++) {
                this.surfaces[i].clearFlight();
                if (i === index && (index !== 0 || this.hasEntered)) {
                    this.surfaces[i].paintFull();
                    if (pose && !this.preference.matches) {
                        Object.assign(this.surfaces[i], { deformAmount: pose.amount, deformSpread: pose.spread, lastIdle: pose.now });
                        this.surfaces[i].idle(pose.now, 0);
                    }
                }
                else this.surfaces[i].clear();
            }
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        frame(now) {
            this.raf = 0;
            if (this.destroyed || document.hidden) return;
            if (this.layoutDirty) this.measure();
            // ScrollTrigger can finish changing a pin after the scroll event.
            // Follow its live positions throughout flight, including retarget snapshots.
            for (const surface of this.surfaces) surface.rect = surface.canvas.getBoundingClientRect();
            this.chooseTarget(now);
            const selected = this.surfaces[this.stage];
            if (this.stage === 0 && !this.activeRelay && this.hasEntered && selected.rect.top > this.height * 0.98) {
                this.hasEntered = false;
                selected.clear();
            }
            if (!this.hasEntered && !this.activeRelay && this.stage === 0) {
                const bounds = selected.bounds(), top = selected.rect.top + bounds.y;
                if (top < this.height * 0.8 && top + bounds.height > 0) {
                    this.hasEntered = true;
                    if (this.preference.matches) this.settle(0);
                    else this.transfer(0, now, { virtual: true, cells: selected.cells.map((cell, i) => ({
                        ...cell, x: selected.rect.left + cell.x + (M.hash(i, 71) - 0.5) * 400,
                        y: -60 - M.hash(i, 72) * 300 + window.scrollY,
                    })) });
                }
            }
            if (this.activeRelay) this.drawRelay(now);
            else if (!this.preference.matches && this.hasEntered && selected.isVisible) selected.idle(now, now - this.lastInteraction);
            if (!this.preference.matches && this.hero.isVisible) this.hero.idle(now, now - this.lastInteraction);
            if (!this.preference.matches && this.footerLogo?.isVisible) this.footerLogo.idle(now, now - this.lastInteraction);
            const current = this.surfaces[this.stage];
            const deforming = (current.isVisible && current.deformAmount > 0) || (this.hero.isVisible && this.hero.deformAmount > 0) || (this.footerLogo?.isVisible && this.footerLogo.deformAmount > 0);
            if (this.activeRelay || (!this.preference.matches && deforming)) this.requestFrame();
            else if (!this.preference.matches && (this.surfaces[this.stage].isVisible || this.hero.isVisible || this.footerLogo?.isVisible)) this.timer = setTimeout(this.wake, 50);
        }

        destroy() {
            this.destroyed = true;
            this.cancelFrame();
            this.events.abort();
            this.observer.disconnect();
            this.resizeObserver.disconnect();
            this.preference.removeEventListener('change', this.onPreference);
            window.ScrollTrigger?.removeEventListener('refresh', this.onLayout);
            this.canvas.remove();
            for (const surface of this.artworks) {
                surface.flightCanvas?.remove();
            }
        }
    }

    function setup() {
        if (!CONFIG.every(options => document.getElementById(options.id))) return;
        window.asciiScene?.destroy();
        window.asciiScene = new AsciiScene();
        window.heroMatrix = window.asciiScene.hero;
        [window.diplomaMatrix, window.solutionsMatrix, window.bottomMatrix] = window.asciiScene.surfaces;
    }
    window.AsciiScene = AsciiScene;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
    else setup();
})();
