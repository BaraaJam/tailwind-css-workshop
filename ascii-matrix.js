/**
 * Lexicon Interactive ASCII Matrix Background Engine
 * Generates an interactive binary/ASCII glyph field that renders custom illuminated vector shapes
 * with mouse proximity spotlight, living character flicker, and Lexicon brand gradient colors.
 */

(function () {
    class AsciiMatrix {
        constructor(options = {}) {
            this.canvasId = options.canvasId;
            this.canvas = document.getElementById(this.canvasId);
            if (!this.canvas) return;

            this.ctx = this.canvas.getContext('2d');
            this.shapeType = options.shape || 'graduation-cap';
            this.cellSize = options.cellSize || 15;
            this.opacity = options.opacity || 0.88;

            // Character pool matching Epic Games high-tech code aesthetic
            this.chars = ['0', '1', '+', '·', '*', '/', 'x', '▫'];
            
            // Mouse tracker
            this.mouse = {
                x: -2000,
                y: -2000,
                radius: options.mouseRadius || 140,
                active: false
            };

            this.isVisible = true;
            this.animFrameId = null;
            this.mask = null;
            this.cols = 0;
            this.rows = 0;

            this.init();
        }

        init() {
            this.resize();
            this.buildMask();

            window.addEventListener('resize', () => {
                this.resize();
                this.buildMask();
            });

            // Track mouse globally so pointer-events-none canvas still receives coordinates
            window.addEventListener('mousemove', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                this.mouse.x = e.clientX - rect.left;
                this.mouse.y = e.clientY - rect.top;
                this.mouse.active = (
                    this.mouse.x >= -this.mouse.radius &&
                    this.mouse.x <= rect.width + this.mouse.radius &&
                    this.mouse.y >= -this.mouse.radius &&
                    this.mouse.y <= rect.height + this.mouse.radius
                );
            });

            window.addEventListener('mouseleave', () => {
                this.mouse.active = false;
                this.mouse.x = -2000;
                this.mouse.y = -2000;
            });

            // Pause rendering when canvas is scrolled out of viewport
            if ('IntersectionObserver' in window) {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach((entry) => {
                        this.isVisible = entry.isIntersecting;
                        if (this.isVisible && !this.animFrameId) {
                            this.animate();
                        }
                    });
                }, { threshold: 0.05 });
                observer.observe(this.canvas);
            }

            this.animate();
        }

        resize() {
            const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
            this.width = rect.width || window.innerWidth;
            this.height = rect.height || window.innerHeight;

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.canvas.width = Math.floor(this.width * dpr);
            this.canvas.height = Math.floor(this.height * dpr);
            this.canvas.style.width = this.width + 'px';
            this.canvas.style.height = this.height + 'px';

            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.scale(dpr, dpr);

            this.cols = Math.ceil(this.width / this.cellSize);
            this.rows = Math.ceil(this.height / this.cellSize);
        }

        /**
         * Rasterizes custom vector paths into a low-resolution binary density mask
         */
        buildMask() {
            const off = document.createElement('canvas');
            off.width = this.cols;
            off.height = this.rows;
            const octx = off.getContext('2d');
            if (!octx) return;

            octx.fillStyle = '#ffffff';

            if (this.shapeType === 'graduation-cap') {
                this.drawGraduationCap(octx, this.cols, this.rows);
            } else if (this.shapeType === 'arrow-down') {
                this.drawArrowDown(octx, this.cols, this.rows);
            }

            const imgData = octx.getImageData(0, 0, this.cols, this.rows).data;
            this.mask = new Float32Array(this.cols * this.rows);

            for (let i = 0; i < this.mask.length; i++) {
                // Read alpha channel
                this.mask[i] = imgData[i * 4 + 3] / 255;
            }
        }

        /**
         * Draws iconic Graduation Cap (Mortarboard + Tassel) for Lexicon Hero
         */
        drawGraduationCap(ctx, w, h) {
            // Position on right-hand side on desktop, center on mobile
            const isMobile = w < 55;
            const cx = isMobile ? w * 0.5 : w * 0.72;
            const cy = isMobile ? h * 0.36 : h * 0.38;
            const scale = Math.min(w, h) * (isMobile ? 0.36 : 0.38);

            ctx.save();

            // 1. Diamond Mortarboard Top (Tilted 3D perspective)
            ctx.beginPath();
            ctx.moveTo(cx, cy - scale * 0.55); // Top corner
            ctx.lineTo(cx + scale * 0.95, cy - scale * 0.12); // Right corner
            ctx.lineTo(cx, cy + scale * 0.32); // Bottom front corner
            ctx.lineTo(cx - scale * 0.95, cy - scale * 0.12); // Left corner
            ctx.closePath();
            ctx.fill();

            // 2. Skull Cap Base (Sits underneath front corner)
            ctx.beginPath();
            ctx.moveTo(cx - scale * 0.55, cy + scale * 0.08);
            ctx.quadraticCurveTo(cx, cy + scale * 0.65, cx + scale * 0.55, cy + scale * 0.08);
            ctx.lineTo(cx + scale * 0.52, cy + scale * 0.32);
            ctx.quadraticCurveTo(cx, cy + scale * 0.88, cx - scale * 0.52, cy + scale * 0.32);
            ctx.closePath();
            ctx.fill();

            // 3. Hanging Ribbon & Tassel (Drapes over right/front corner)
            ctx.lineWidth = Math.max(1.8, scale * 0.07);
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(cx, cy - scale * 0.12); // Center button
            ctx.quadraticCurveTo(cx + scale * 0.65, cy - scale * 0.05, cx + scale * 0.78, cy + scale * 0.55);
            ctx.stroke();

            // Tassel Bobble
            ctx.beginPath();
            ctx.arc(cx + scale * 0.78, cy + scale * 0.65, scale * 0.10, 0, Math.PI * 2);
            ctx.fill();

            // Center Button on Mortarboard
            ctx.beginPath();
            ctx.arc(cx, cy - scale * 0.12, scale * 0.06, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        /**
         * Draws sleek Downward Arrow for Explore Solutions Section
         */
        drawArrowDown(ctx, w, h) {
            const isMobile = w < 55;
            // Center positioned arrow framing the showcase
            const cx = w * 0.5;
            const cy = h * 0.50;
            const scale = Math.min(w, h) * (isMobile ? 0.44 : 0.48);

            ctx.save();
            ctx.beginPath();

            const shaftWidth = scale * 0.30;
            const shaftTop = cy - scale * 0.95;
            const shaftBottom = cy + scale * 0.22;
            const headWidth = scale * 0.86;
            const headTip = cy + scale * 0.95;

            // Shaft
            ctx.moveTo(cx - shaftWidth / 2, shaftTop);
            ctx.lineTo(cx + shaftWidth / 2, shaftTop);
            ctx.lineTo(cx + shaftWidth / 2, shaftBottom);

            // Arrow Head Outset
            ctx.lineTo(cx + headWidth / 2, shaftBottom);
            // Arrow Head Tip
            ctx.lineTo(cx, headTip);
            // Arrow Head Left Outset
            ctx.lineTo(cx - headWidth / 2, shaftBottom);
            ctx.lineTo(cx - shaftWidth / 2, shaftBottom);

            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        /**
         * Main render loop
         */
        animate() {
            if (!this.isVisible) {
                this.animFrameId = null;
                return;
            }

            this.ctx.clearRect(0, 0, this.width, this.height);
            this.ctx.font = '500 11px "Inter", "JetBrains Mono", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            const mask = this.mask;
            const now = performance.now() * 0.001;

            for (let r = 0; r < this.rows; r++) {
                const y = r * this.cellSize + this.cellSize / 2;
                for (let c = 0; c < this.cols; c++) {
                    const idx = r * this.cols + c;
                    const shapeAlpha = mask ? mask[idx] : 0;
                    const x = c * this.cellSize + this.cellSize / 2;

                    // Mouse proximity calculations
                    let mouseInfluence = 0;
                    if (this.mouse.active) {
                        const dx = x - this.mouse.x;
                        const dy = y - this.mouse.y;
                        const dist = Math.hypot(dx, dy);
                        if (dist < this.mouse.radius) {
                            mouseInfluence = Math.pow(1 - dist / this.mouse.radius, 1.8);
                        }
                    }

                    const isIlluminated = shapeAlpha > 0.18 || mouseInfluence > 0.05;

                    // Character selection: living matrix flicker
                    // Subtle organic noise without rapid eye strain
                    const noise = Math.sin(c * 0.35 + r * 0.28 + now * 1.8);
                    const charIndex = Math.abs(Math.floor((c * 7 + r * 13 + (noise > 0.85 ? now * 4 : 0)) % this.chars.length));
                    const char = this.chars[charIndex];

                    if (isIlluminated) {
                        // Blend Lexicon brand colors across coordinates
                        // Purple (#4314E5) -> Violet (#6950F3) -> Hot Pink (#F8529E) -> Amber Yellow (#FCD332)
                        const normX = x / this.width;
                        const normY = y / this.height;
                        const t = Math.min(Math.max((normX * 0.6 + normY * 0.4), 0), 1);

                        let red, green, blue;
                        if (t < 0.4) {
                            // Deep Purple (67, 20, 229) to Violet (105, 80, 243)
                            const lt = t / 0.4;
                            red = Math.round(67 + (105 - 67) * lt);
                            green = Math.round(20 + (80 - 20) * lt);
                            blue = Math.round(229 + (243 - 229) * lt);
                        } else if (t < 0.75) {
                            // Violet (105, 80, 243) to Pink (248, 82, 158)
                            const lt = (t - 0.4) / 0.35;
                            red = Math.round(105 + (248 - 105) * lt);
                            green = Math.round(80 + (82 - 80) * lt);
                            blue = Math.round(243 + (158 - 243) * lt);
                        } else {
                            // Pink (248, 82, 158) to Amber Yellow (252, 211, 50)
                            const lt = (t - 0.75) / 0.25;
                            red = Math.round(248 + (252 - 248) * lt);
                            green = Math.round(82 + (211 - 82) * lt);
                            blue = Math.round(158 + (50 - 158) * lt);
                        }

                        // Alpha calculation (combines shape strength and mouse spotlight)
                        const finalAlpha = Math.min(1.0, (shapeAlpha * 0.88 + mouseInfluence * 0.95) * this.opacity);

                        this.ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${finalAlpha})`;
                        this.ctx.fillText(char, x, y);
                    } else {
                        // Ambient inactive background glyphs (soft, subtle lavender/slate)
                        this.ctx.fillStyle = 'rgba(67, 20, 229, 0.045)';
                        this.ctx.fillText(char, x, y);
                    }
                }
            }

            this.animFrameId = requestAnimationFrame(() => this.animate());
        }
    }

    // Expose class globally
    window.AsciiMatrix = AsciiMatrix;

    // Auto-instantiate once DOM is ready
    function setupAsciiMatrices() {
        // 1. Hero Canvas: Graduation Cap (Education & Skills Development)
        const heroCanvas = document.getElementById('hero-matrix-canvas');
        if (heroCanvas) {
            new AsciiMatrix({
                canvasId: 'hero-matrix-canvas',
                shape: 'graduation-cap',
                cellSize: 15,
                opacity: 0.90
            });
        }

        // 2. Section 3 Canvas: Downward Arrow (Explore Lexicon's Solutions)
        const solutionsCanvas = document.getElementById('solutions-matrix-canvas');
        if (solutionsCanvas) {
            new AsciiMatrix({
                canvasId: 'solutions-matrix-canvas',
                shape: 'arrow-down',
                cellSize: 15,
                opacity: 0.85
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupAsciiMatrices);
    } else {
        setupAsciiMatrices();
    }
})();
