/* Sample local artwork once and keep the finished glyphs in a tile atlas. */
(function () {
    const { hash, layoutScale, rasterSize, wave, afkPulse, deformOffset } = window.AsciiMotion;
    const FONT = '"Lexicon Matrix", ui-monospace, monospace';
    let fontReady;
    class AsciiArtwork {
        constructor(canvas, options) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.options = options;
            if (!options.static && options.localFlight !== false) {
                this.flightCanvas = document.createElement('canvas');
                this.flightCanvas.className = 'ascii-background-layer';
                this.flightCanvas.setAttribute('aria-hidden', 'true');
                this.flightCtx = this.flightCanvas.getContext('2d');
                canvas.before(this.flightCanvas);
            }
            this.cells = [];
            this.width = 0;
            this.height = 0;
            this.isVisible = false;
            this.image = new Image();
            // A data URL keeps pixel sampling origin-clean on both file:// and HTTP.
            this.image.src = window.AsciiAssets.art[options.shape];
            this.ready = this.image.decode();
            this.phase = hash(options.seed, 1);
        }

        static loadFont() {
            if (!fontReady) {
                const font = new FontFace('Lexicon Matrix', `url("${window.AsciiAssets.font}")`, { weight: '400' });
                document.fonts.add(font);
                fontReady = font.load().catch(() => { document.fonts.delete(font); });
            }
            return fontReady;
        }

        static flightAtlas(tints, fontSize, dpr) {
            const colours = [...new Set(tints.flat())];
            const scale = Math.min(dpr, 1.5), tile = Math.ceil((fontSize + 6) * scale);
            const columns = Math.max(1, Math.ceil(Math.sqrt(colours.length * 2)));
            const canvas = document.createElement('canvas');
            canvas.width = columns * tile;
            canvas.height = Math.max(tile, Math.ceil(colours.length * 2 / columns) * tile);
            const ctx = canvas.getContext('2d');
            ctx.font = `400 ${fontSize * scale}px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const slots = new Map();
            colours.forEach((colour, i) => {
                ctx.fillStyle = colour;
                const boxes = [];
                for (let glyph = 0; glyph < 2; glyph++) {
                    const slot = i * 2 + glyph, x = slot % columns * tile, y = Math.floor(slot / columns) * tile;
                    ctx.fillText(String(glyph), x + tile / 2, y + tile / 2);
                    boxes.push([x, y, tile, tile]);
                }
                slots.set(colour, boxes);
            });
            return { canvas, size: tile / scale, tiles: tints.map(row => row.map(colour => slots.get(colour))) };
        }

        bounds() {
            const { width: w, height: h } = this;
            const scale = layoutScale(window.innerWidth || w, window.innerHeight || h);
            const mobile = w < 768;
            const ratio = this.image.naturalWidth / this.image.naturalHeight;
            let width, cx, cy;
            if (this.options.shape === 'cap') {
                width = Math.min(w * (mobile ? 0.86 : 0.48), h * 0.84);
                cx = w * (mobile ? 0.53 : 0.74);
                cy = h * (mobile ? 0.46 : 0.45);
            } else if (this.options.shape === 'diploma') {
                return this.artBounds || { x: Math.round(w * 0.08), y: Math.round(h * 0.12), width: Math.min(w * 0.35, 280), height: Math.min(h * 0.35, 245), rotation: -15 * Math.PI / 180 };
            } else if (this.options.shape === 'arrow') {
                width = Math.min(w * 0.86, h * 0.72, 600 * scale);
                const height = Math.min(h * 0.91, 900 * scale);
                return { x: (w - width) / 2, y: h * 0.55 - height / 2, width, height };
            } else if (this.options.shape === 'logo') {
                width = Math.min(w * 0.98, h * 0.96 * ratio, 1080 * scale);
                cx = w * 0.5;
                cy = h * 0.5;
            } else {
                width = Math.min(w * (mobile ? 0.6 : 0.33), h * 0.94 * ratio);
                cx = w * (mobile ? (h <= 260 ? 0.5 : 0.73) : 0.81);
                cy = h * 0.5;
            }
            return { x: cx - width / 2, y: cy - width / ratio / 2, width, height: width / ratio };
        }

        resize(rect = this.canvas.getBoundingClientRect()) {
            this.rect = rect;
            this.displayRect = rect;
            const { width, height, dpr, pixelWidth, pixelHeight } = rasterSize(this.canvas?.clientWidth || rect.width, this.canvas?.clientHeight || rect.height, window.devicePixelRatio);
            const scale = layoutScale(window.innerWidth || width, window.innerHeight || height);
            const boundsKey = this.artBounds ? JSON.stringify(this.artBounds) : '';
            const sameBounds = !this.artBounds || (this.cachedArtBounds && Object.keys(this.artBounds).every(key => Math.abs(this.artBounds[key] - this.cachedArtBounds[key]) <= 2));
            // ScrollTrigger rounds a pinned 678.4px section to 679px at 125% zoom.
            // Reuse its atlas for that rounding; rebuilding would cancel the live relay.
            if (Math.abs(width - this.width) <= 2 && Math.abs(height - this.height) <= 2 && (width < 768) === (this.width < 768) && window.devicePixelRatio === this.deviceScale && Math.abs(scale - (this.layoutScale || 1)) < 0.001 && sameBounds) {
                if (this.flightCanvas) this.positionFlight();
                return false;
            }
            this.boundsKey = boundsKey;
            this.cachedArtBounds = this.artBounds ? { ...this.artBounds } : null;
            this.deviceScale = window.devicePixelRatio;
            this.layoutScale = scale;
            this.width = width;
            this.height = height;
            this.dpr = dpr;
            const logo = this.options.shape === 'logo';
            this.pitch = Math.round(this.options.pitch || (logo ? Math.max(5, Math.min(16 * scale, this.bounds().height / 10)) : (width < 768 ? 11 : 12) * scale));
            for (const canvas of [this.canvas, this.flightCanvas].filter(Boolean)) {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
            }
            if (this.flightCanvas) this.positionFlight();
            this.build();
            return true;
        }

        build() {
            const sample = document.createElement('canvas');
            sample.width = Math.ceil(this.width);
            sample.height = Math.ceil(this.height);
            const ctx = sample.getContext('2d', { willReadFrequently: true });
            const bounds = this.bounds();
            if (bounds.rotation) {
                ctx.save();
                ctx.translate(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
                ctx.rotate(bounds.rotation);
                ctx.drawImage(this.image, -bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height);
                ctx.restore();
            } else {
                ctx.drawImage(this.image, bounds.x, bounds.y, bounds.width, bounds.height);
            }
            const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
            const cells = [], pitch = this.pitch;
            const strength = this.options.shape === 'logo' ? 1 : this.options.dark ? 0.92 : (this.width < 768 ? 0.60 : 0.82);
            for (let row = 0; row * pitch < this.height; row++) {
                for (let col = 0; col * pitch < this.width; col++) {
                    const seed = row * 65536 + col + this.options.seed * 997;
                    const x = (col + 0.5) * pitch, y = (row + 0.5) * pitch;
                    let ink = 0, r = 0, g = 0, b = 0, maximum = 0, samples = 0;
                    for (let sy = row * pitch; sy < Math.min((row + 1) * pitch, sample.height); sy += 2) {
                        for (let sx = col * pitch; sx < Math.min((col + 1) * pitch, sample.width); sx += 2) {
                            const index = (Math.floor(sy) * sample.width + Math.floor(sx)) * 4;
                            const alpha = pixels[index + 3] / 255;
                            ink += alpha;
                            r += pixels[index] * alpha;
                            g += pixels[index + 1] * alpha;
                            b += pixels[index + 2] * alpha;
                            maximum = Math.max(maximum, alpha);
                            samples++;
                        }
                    }
                    let rgb, alpha;
                    if (ink > 0.01) {
                        rgb = [r, g, b].map(value => Math.round(value / ink));
                        ink /= samples;
                        alpha = Math.min(0.90, maximum * (0.18 + ink * 0.78)) * strength;
                    } else {
                        continue;
                    }
                    if (alpha < 0.012) continue;
                    const glyph = ink > 0.12 ? (hash(seed, 4) < 0.5 ? '0' : '1') : '01+.:/x'[Math.floor(hash(seed, 4) * 7)];
                    cells.push({ x, y, col, row, seed, ink, alpha, rgb, glyph, colour: `rgb(${rgb.join(',')})` });
                }
            }
            this.cells = cells;
            this.tileBoxes = cells.map(cell => {
                const x = Math.round(cell.col * pitch * this.dpr), y = Math.round(cell.row * pitch * this.dpr);
                return [x, y, Math.round((cell.col + 1) * pitch * this.dpr) - x, Math.round((cell.row + 1) * pitch * this.dpr) - y];
            });
            const left = cells.length ? Math.min(...this.tileBoxes.map(box => box[0])) : 0;
            const top = cells.length ? Math.min(...this.tileBoxes.map(box => box[1])) : 0;
            const right = cells.length ? Math.max(...this.tileBoxes.map(box => box[0] + box[2])) : 1;
            const bottom = cells.length ? Math.max(...this.tileBoxes.map(box => box[1] + box[3])) : 1;
            this.atlasOrigin = { x: left, y: top };
            this.atlasBoxes = this.tileBoxes.map(([x, y, w, h]) => [x - left, y - top, w, h]);
            this.sprite = document.createElement('canvas');
            this.sprite.width = right - left;
            this.sprite.height = bottom - top;
            this.alternateSprite = document.createElement('canvas');
            this.alternateSprite.width = right - left;
            this.alternateSprite.height = bottom - top;
            for (const [atlas, alternate] of [[this.sprite, false], [this.alternateSprite, true]]) {
                const spriteCtx = atlas.getContext('2d');
                spriteCtx.setTransform(this.dpr, 0, 0, this.dpr, -left, -top);
                spriteCtx.font = `${this.options.shape === 'logo' ? 600 : 400} ${pitch * (this.options.shape === 'logo' ? 0.88 : 0.74)}px ${FONT}`;
                spriteCtx.textAlign = 'center';
                spriteCtx.textBaseline = 'middle';
                for (const cell of cells) {
                    spriteCtx.fillStyle = cell.colour;
                    spriteCtx.globalAlpha = cell.alpha;
                    const glyph = alternate ? (cell.glyph === '0' ? '1' : '0') : cell.glyph;
                    spriteCtx.fillText(glyph, cell.x, cell.y);
                }
            }
            this.waveStates = new Uint8Array(cells.length);
        }

        clear() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        clearFlight() {
            this.flightCtx?.clearRect(0, 0, this.flightCanvas.width, this.flightCanvas.height);
            this.flightActive = false;
        }

        positionFlight() {
            Object.assign(this.flightCanvas.style, {
                inset: 'auto', left: `${this.canvas.offsetLeft}px`, top: `${this.canvas.offsetTop}px`,
                width: `${this.canvas.clientWidth}px`, height: `${this.canvas.clientHeight}px`,
            });
        }

        paintFlight(viewport, width, height) {
            const rect = this.displayRect || this.rect;
            if (rect.bottom < 0 || rect.top > height || this.canvas.parentElement.style.visibility === 'hidden') {
                if (this.flightActive) this.clearFlight();
                return;
            }
            if (!this.flightCanvas) {
                this.flightCanvas = document.createElement('canvas');
                this.flightCanvas.className = 'ascii-background-layer';
                this.flightCanvas.setAttribute('aria-hidden', 'true');
                this.flightCanvas.width = this.canvas.width;
                this.flightCanvas.height = this.canvas.height;
                this.flightCtx = this.flightCanvas.getContext('2d');
                this.canvas.before(this.flightCanvas);
                this.positionFlight();
            }
            this.clearFlight();
            const sx = rect.width / this.width, sy = rect.height / this.height;
            this.flightCtx.drawImage(viewport, -rect.left * this.dpr / sx, -rect.top * this.dpr / sy, width * this.dpr / sx, height * this.dpr / sy);
            this.flightActive = true;
        }

        paintFull() {
            this.clear();
            this.ctx.drawImage(this.sprite, this.atlasOrigin?.x || 0, this.atlasOrigin?.y || 0);
            this.waveStates.fill(0);
            this.deformAmount = 0;
            this.isMorphing = false;
            this.wasDeformed = false;
            this.lastIdle = null;
        }

        tile(index) {
            if (this.tileBoxes) return this.tileBoxes[index];
            const cell = this.cells[index], scale = this.dpr;
            const x = Math.round(cell.col * this.pitch * scale);
            const y = Math.round(cell.row * this.pitch * scale);
            return [x, y, Math.round((cell.col + 1) * this.pitch * scale) - x, Math.round((cell.row + 1) * this.pitch * scale) - y];
        }

        paintCell(index, visible, alternate = false) {
            const box = this.tile(index);
            this.ctx.clearRect(...box);
            if (visible) this.ctx.drawImage(alternate ? this.alternateSprite : this.sprite, ...(this.atlasBoxes?.[index] || box), ...box);
        }

        idle(now, idleFor = 0) {
            const pulse = this.options.noDeform ? 0 : afkPulse(idleFor);
            const previous = this.deformAmount || 0;
            const elapsed = this.lastIdle == null ? 0 : now - this.lastIdle;
            this.lastIdle = now;
            const amount = this.options.noDeform ? 0 : (pulse > 0 ? pulse : Math.max(0, previous - elapsed / 550));
            this.deformAmount = amount;
            this.isMorphing = amount !== previous || (amount > 0 && pulse === 0);
            if (amount > 0) {
                if (amount === previous && this.wasDeformed) return;
                const bounds = this.bounds();
                this.deformSpread = Math.max(18, Math.min(bounds.width, bounds.height) * 0.18);
                this.clear();
                this.ctx.globalAlpha = 1 - amount * 0.25;
                this.cells.forEach((cell, index) => {
                    const offset = deformOffset(cell, amount, this.deformSpread), box = this.tile(index);
                    const atlas = this.waveStates[index] === 1 ? this.alternateSprite : this.sprite;
                    this.ctx.drawImage(atlas, ...(this.atlasBoxes?.[index] || box), Math.round(box[0] + offset.x * this.dpr), Math.round(box[1] + offset.y * this.dpr), box[2], box[3]);
                });
                this.ctx.globalAlpha = 1;
                this.wasDeformed = true;
                return;
            }
            if (this.wasDeformed) { this.paintFull(); this.wasDeformed = false; }
            this.cells.forEach((cell, index) => {
                const depth = cell.y / this.height + (hash(cell.seed, 6) - 0.5) * 0.025;
                const band = wave(depth, now, this.phase);
                const sparse = hash(cell.seed, Math.floor(now / 2400)) < 0.012;
                const swapped = hash(cell.seed, 9) < band * (this.options.static ? 0.13 : 0.3) || sparse ? 1 : 0;
                if (swapped === this.waveStates[index]) return;
                this.waveStates[index] = swapped;
                this.paintCell(index, true, swapped === 1);
            });
        }
    }
    window.AsciiArtwork = AsciiArtwork;
})();
