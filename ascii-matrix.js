/**
 * Lexicon Interactive ASCII Matrix Background Engine
 * Generates an interactive binary/ASCII glyph field that renders custom illuminated vector shapes.
 * Features a dynamic Beehive Swarm Convergence System:
 * - Particles fly as a wide, buzzing swarm from the top or bottom depending on scroll direction.
 * - Fills the entire shape all at once once the section is in view (>= 35-50% scrolled).
 * - Stable hysteresis: does not break or disperse on small scroll adjustments.
 * - Animate-in on load / refresh / scroll back for Hero.
 * - Interactive mouse spotlight and Lexicon brand gradient coloring.
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
            this.darkTheme = !!options.darkTheme;
            this.position = options.position || 'default';

            // Convergence progress [0..1]
            this.fillProgress = options.fillProgress !== undefined ? options.fillProgress : 0.0;
            this.currentProgress = this.fillProgress;
            this.targetProgress = this.fillProgress;
            this.isLocked = this.fillProgress >= 0.99;

            // Swarm fly direction: 'down' (from top moving down), 'up' (from bottom moving up)
            this.motionDirection = (options.flyDirection === 1 || options.motionDirection === 'up') ? 'up' : 'down';
            this.exitDirection = options.exitDirection || 'down';
            this.lastScrollY = window.scrollY;

            // Character pool matching Epic Games binary/code aesthetic
            this.chars = ['0', '1', '0', '1', '1', '0', '+', '·', '*', '/', 'x'];
            
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
            this.particles = [];
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

            // Automatically track scroll direction
            window.addEventListener('scroll', () => {
                const curY = window.scrollY;
                const diff = curY - this.lastScrollY;
                if (Math.abs(diff) > 2) {
                    this.flyDirection = diff > 0 ? -1 : 1;
                    this.lastScrollY = curY;
                }
            }, { passive: true });

            // Global mouse tracking
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

            // Pause rendering when canvas is scrolled off-screen
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

        /**
         * Directly trigger shape fill (swarm converges and locks into shape all-at-once)
         */
        triggerFill(dir = 'down') {
            const isUp = (dir === 1 || dir === 'up' || dir === 'bottom' || dir === 'from-bottom');
            this.motionDirection = isUp ? 'up' : 'down';
            this.targetProgress = 1.0;
            this.isLocked = true;
        }

        /**
         * Directly trigger shape dispersal (swarm scatters and flies away)
         */
        triggerDisperse(dir = 'down') {
            const isUp = (dir === 1 || dir === 'up' || dir === 'top' || dir === 'to-top');
            this.exitDirection = isUp ? 'up' : 'down';
            this.targetProgress = 0.0;
            this.isLocked = false;
        }

        /**
         * Threshold-based scroll update:
         * - Autonomous: does NOT continuously scrub or clamp targetProgress with every pixel scroll.
         * - If progress >= 0.40, immediately triggers full convergence in scroll direction.
         * - If progress <= 0.05, disperses.
         */
        updateByScroll(progress, scrollDir) {
            const dir = (scrollDir !== undefined && scrollDir < 0) ? 'up' : 'down';
            if (progress >= 0.40) {
                if (this.targetProgress < 1.0) {
                    this.triggerFill(dir);
                }
            } else if (progress <= 0.05) {
                if (this.targetProgress > 0.0) {
                    this.triggerDisperse(dir);
                }
            }
        }

        /**
         * Backward compatibility wrapper with threshold latching
         */
        setProgress(val) {
            if (val >= 0.40) {
                this.triggerFill('down');
            } else if (val <= 0.05) {
                this.triggerDisperse('down');
            }
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
         * Rasterizes custom vector paths into density mask and generates shape swarm particles
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
            } else if (this.shapeType === 'question-mark') {
                this.drawQuestionMark(octx, this.cols, this.rows);
            }

            const imgData = octx.getImageData(0, 0, this.cols, this.rows).data;
            this.mask = new Float32Array(this.cols * this.rows);
            this.particles = [];

            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const idx = r * this.cols + c;
                    const alpha = imgData[idx * 4 + 3] / 255;
                    this.mask[idx] = alpha;

                    if (alpha > 0.15) {
                        const homeX = c * this.cellSize + this.cellSize / 2;
                        const homeY = r * this.cellSize + this.cellSize / 2;

                        // Wide beehive dispersion spread
                        const angle = Math.random() * Math.PI * 2;
                        const dist = 40 + Math.random() * 150;

                        this.particles.push({
                            c, r,
                            homeX, homeY,
                            targetAlpha: alpha,
                            scatterX: Math.cos(angle) * dist,
                            scatterY: Math.sin(angle) * dist * 0.8,
                            buzzFreqX: 2.2 + Math.random() * 4.0,
                            buzzFreqY: 2.0 + Math.random() * 4.0,
                            buzzAmp: 8 + Math.random() * 18,
                            driftAngle: (Math.random() - 0.5) * 60,
                            phase: Math.random() * Math.PI * 2,
                            charSeed: Math.random() * 1000
                        });
                    }
                }
            }
        }

        /**
         * Graduation Cap (Mortarboard + Tassel) for Hero
         */
        drawGraduationCap(ctx, w, h) {
            const isMobile = w < 55;
            const cx = isMobile ? w * 0.5 : w * 0.72;
            const cy = isMobile ? h * 0.36 : h * 0.38;
            const scale = Math.min(w, h) * (isMobile ? 0.36 : 0.38);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cx, cy - scale * 0.55);
            ctx.lineTo(cx + scale * 0.95, cy - scale * 0.12);
            ctx.lineTo(cx, cy + scale * 0.32);
            ctx.lineTo(cx - scale * 0.95, cy - scale * 0.12);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(cx - scale * 0.55, cy + scale * 0.08);
            ctx.quadraticCurveTo(cx, cy + scale * 0.65, cx + scale * 0.55, cy + scale * 0.08);
            ctx.lineTo(cx + scale * 0.52, cy + scale * 0.32);
            ctx.quadraticCurveTo(cx, cy + scale * 0.88, cx - scale * 0.52, cy + scale * 0.32);
            ctx.closePath();
            ctx.fill();

            ctx.lineWidth = Math.max(1.8, scale * 0.07);
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(cx, cy - scale * 0.12);
            ctx.quadraticCurveTo(cx + scale * 0.65, cy - scale * 0.05, cx + scale * 0.78, cy + scale * 0.55);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(cx + scale * 0.78, cy + scale * 0.65, scale * 0.10, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy - scale * 0.12, scale * 0.06, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        /**
         * Downward Arrow for Explore Solutions Section
         */
        drawArrowDown(ctx, w, h) {
            const isMobile = w < 55;
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

            ctx.moveTo(cx - shaftWidth / 2, shaftTop);
            ctx.lineTo(cx + shaftWidth / 2, shaftTop);
            ctx.lineTo(cx + shaftWidth / 2, shaftBottom);
            ctx.lineTo(cx + headWidth / 2, shaftBottom);
            ctx.lineTo(cx, headTip);
            ctx.lineTo(cx - headWidth / 2, shaftBottom);
            ctx.lineTo(cx - shaftWidth / 2, shaftBottom);

            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        /**
         * Stylized Question Mark matching Epic Games FAQ reference
         */
        drawQuestionMark(ctx, w, h) {
            const isMobile = w < 55;
            const cx = isMobile ? w * 0.5 : (this.position === 'center' ? w * 0.5 : w * 0.78);
            const cy = h * 0.48;
            const scale = Math.min(w * (isMobile ? 0.40 : 0.30), h * 0.62);

            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.fillStyle = '#ffffff';
            ctx.lineWidth = Math.max(2.5, scale * 0.30);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // 1. Hook & stem
            ctx.beginPath();
            ctx.moveTo(cx - scale * 0.44, cy - scale * 0.32);
            ctx.bezierCurveTo(
                cx - scale * 0.44, cy - scale * 0.88,
                cx + scale * 0.48, cy - scale * 0.88,
                cx + scale * 0.48, cy - scale * 0.32
            );
            ctx.bezierCurveTo(
                cx + scale * 0.48, cy - scale * 0.02,
                cx, cy - scale * 0.02,
                cx, cy + scale * 0.18
            );
            ctx.lineTo(cx, cy + scale * 0.24);
            ctx.stroke();

            // 2. Bottom dot
            ctx.beginPath();
            ctx.arc(cx, cy + scale * 0.65, scale * 0.16, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        /**
         * Main render loop with Beehive Swarm Convergence Engine
         */
        animate() {
            if (!this.isVisible) {
                this.animFrameId = null;
                return;
            }

            // Smooth interpolation towards targetProgress (snappy, responsive convergence)
            const stepSpeed = this.targetProgress === 1.0 ? 0.09 : 0.12;
            if (Math.abs(this.targetProgress - this.currentProgress) > 0.001) {
                this.currentProgress += (this.targetProgress - this.currentProgress) * stepSpeed;
            } else {
                this.currentProgress = this.targetProgress;
            }

            this.ctx.clearRect(0, 0, this.width, this.height);
            this.ctx.font = '500 11px "Inter", "JetBrains Mono", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            const now = performance.now() * 0.001;
            const p = this.currentProgress;

            // 1. RENDER AMBIENT BACKGROUND MATRIX GRID
            for (let r = 0; r < this.rows; r++) {
                const y = r * this.cellSize + this.cellSize / 2;
                for (let c = 0; c < this.cols; c++) {
                    const x = c * this.cellSize + this.cellSize / 2;

                    let mouseInfluence = 0;
                    if (this.mouse.active) {
                        const dist = Math.hypot(x - this.mouse.x, y - this.mouse.y);
                        if (dist < this.mouse.radius) {
                            mouseInfluence = Math.pow(1 - dist / this.mouse.radius, 1.8);
                        }
                    }

                    const noise = Math.sin(c * 0.35 + r * 0.28 + now * 1.8);
                    const charIdx = Math.abs(Math.floor((c * 7 + r * 13 + (noise > 0.85 ? now * 4 : 0)) % this.chars.length));
                    const char = this.chars[charIdx];

                    if (mouseInfluence > 0.05) {
                        const alpha = Math.min(0.85, mouseInfluence * 0.75);
                        this.ctx.fillStyle = this.darkTheme
                            ? `rgba(139, 127, 245, ${alpha})`
                            : `rgba(67, 20, 229, ${alpha})`;
                    } else {
                        this.ctx.fillStyle = this.darkTheme
                            ? 'rgba(255, 255, 255, 0.045)'
                            : 'rgba(67, 20, 229, 0.045)';
                    }
                    this.ctx.fillText(char, x, y);
                }
            }

            // 2. RENDER BEEHIVE SWARM PARTICLES
            if (p > 0.005 && this.particles.length > 0) {
                const travelDist = this.height * 0.85;
                let clusterOffsetY = 0;
                let easeSettle = 1.0;

                if (this.targetProgress === 1.0 || (this.isLocked && p >= 0.95)) {
                    // ENTERING / CONVERGING INTO SHAPE ALL-AT-ONCE
                    const flyRatio = Math.min(1.0, Math.max(0.0, p / 0.45));
                    const settleRatio = Math.min(1.0, Math.max(0.0, (p - 0.15) / 0.85));
                    easeSettle = settleRatio * settleRatio * (3.0 - 2.0 * settleRatio);

                    const enterSign = this.motionDirection === 'up' ? 1 : -1;
                    clusterOffsetY = enterSign * travelDist * (1.0 - flyRatio);
                } else {
                    // EXITING / DISPERSING OUT OF SHAPE
                    const exitProgress = 1.0 - p;
                    const exitFly = Math.min(1.0, Math.max(0.0, exitProgress / 0.80));
                    easeSettle = Math.max(0.0, 1.0 - exitFly);

                    const exitSign = this.exitDirection === 'up' ? -1 : 1;
                    clusterOffsetY = exitSign * travelDist * exitFly;
                }

                // Dispersion & buzzing jitter
                const dispersion = 1.0 - easeSettle;
                const overallAlpha = Math.min(1.0, p * 2.5);

                const len = this.particles.length;
                for (let i = 0; i < len; i++) {
                    const pt = this.particles[i];

                    // Beehive buzzing jitter & lateral flight drift
                    const buzzX = Math.sin(now * pt.buzzFreqX + pt.phase) * pt.buzzAmp * dispersion;
                    const buzzY = Math.cos(now * pt.buzzFreqY + pt.phase) * pt.buzzAmp * dispersion;
                    const driftX = pt.driftAngle * dispersion;

                    // Current particle position in space
                    const curX = pt.homeX + (pt.scatterX + driftX) * dispersion + buzzX;
                    const curY = pt.homeY + clusterOffsetY + pt.scatterY * dispersion + buzzY;

                    // Mouse proximity on swarm particles
                    let mouseInfluence = 0;
                    if (this.mouse.active) {
                        const dist = Math.hypot(curX - this.mouse.x, curY - this.mouse.y);
                        if (dist < this.mouse.radius) {
                            mouseInfluence = Math.pow(1 - dist / this.mouse.radius, 1.8);
                        }
                    }

                    // Dynamic character selection:
                    let char;
                    if (dispersion > 0.08) {
                        // High-speed code rain flicker while in flight
                        const idx = Math.abs(Math.floor(pt.charSeed + now * 32)) % this.chars.length;
                        char = this.chars[idx];
                    } else {
                        // Organic breathing loop when settled
                        const noise = Math.sin(pt.c * 0.35 + pt.r * 0.28 + now * 1.8);
                        const idx = Math.abs(Math.floor((pt.c * 7 + pt.r * 13 + (noise > 0.85 ? now * 4 : 0)) % this.chars.length));
                        char = this.chars[idx];
                    }

                    // Lexicon brand colors
                    // Deep Purple (#4314E5) -> Violet (#6950F3) -> Hot Pink (#F8529E) -> Amber Yellow (#FCD332)
                    const normX = curX / this.width;
                    const normY = curY / this.height;
                    const t = Math.min(Math.max((normX * 0.6 + normY * 0.4), 0), 1);

                    let red, green, blue;
                    if (t < 0.4) {
                        const lt = t / 0.4;
                        red = Math.round(67 + (105 - 67) * lt);
                        green = Math.round(20 + (80 - 20) * lt);
                        blue = Math.round(229 + (243 - 229) * lt);
                    } else if (t < 0.75) {
                        const lt = (t - 0.4) / 0.35;
                        red = Math.round(105 + (248 - 105) * lt);
                        green = Math.round(80 + (82 - 80) * lt);
                        blue = Math.round(243 + (158 - 243) * lt);
                    } else {
                        const lt = (t - 0.75) / 0.25;
                        red = Math.round(248 + (252 - 248) * lt);
                        green = Math.round(82 + (211 - 82) * lt);
                        blue = Math.round(158 + (50 - 158) * lt);
                    }

                    // Flying swarm energy spark
                    if (dispersion > 0.10) {
                        const spark = dispersion * 0.60;
                        red = Math.min(255, Math.round(red + (255 - red) * spark));
                        green = Math.min(255, Math.round(green + (255 - green) * spark));
                        blue = Math.min(255, Math.round(blue + (255 - blue) * spark));
                    }

                    // Final opacity
                    const alpha = Math.min(1.0, (pt.targetAlpha * 0.90 + mouseInfluence * 0.95) * this.opacity * overallAlpha);

                    this.ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
                    this.ctx.fillText(char, curX, curY);
                }
            }

            this.animFrameId = requestAnimationFrame(() => this.animate());
        }
    }

    // Expose class globally
    window.AsciiMatrix = AsciiMatrix;

    // Auto-instantiate once DOM is ready
    function setupAsciiMatrices() {
        // 1. Hero Canvas: Graduation Cap
        const heroCanvas = document.getElementById('hero-matrix-canvas');
        if (heroCanvas) {
            window.heroMatrix = new AsciiMatrix({
                canvasId: 'hero-matrix-canvas',
                shape: 'graduation-cap',
                cellSize: 15,
                opacity: 0.90,
                fillProgress: 0.0 // starts 0, triggers in on load
            });

            // Smooth entrance flight on load / refresh
            setTimeout(() => {
                if (window.heroMatrix) {
                    window.heroMatrix.triggerFill('down');
                }
            }, 180);
        }

        // 2. Section 3 Canvas: Downward Arrow (Explore Lexicon's Solutions)
        const solutionsCanvas = document.getElementById('solutions-matrix-canvas');
        if (solutionsCanvas) {
            window.solutionsMatrix = new AsciiMatrix({
                canvasId: 'solutions-matrix-canvas',
                shape: 'arrow-down',
                cellSize: 15,
                opacity: 0.88,
                fillProgress: 0.0
            });
        }

        // 3. Bottom Canvas: Question Mark
        const bottomCanvas = document.getElementById('bottom-matrix-canvas');
        if (bottomCanvas) {
            window.bottomMatrix = new AsciiMatrix({
                canvasId: 'bottom-matrix-canvas',
                shape: 'question-mark',
                cellSize: 14,
                opacity: 0.95,
                fillProgress: 0.0,
                darkTheme: true
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupAsciiMatrices);
    } else {
        setupAsciiMatrices();
    }
})();
