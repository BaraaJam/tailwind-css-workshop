const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const motion = require('../ascii-motion.js');

function artworkClass(globals = {}) {
    const context = { window: { AsciiMotion: motion, devicePixelRatio: 1.25 }, ...globals };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../ascii-artwork.js'), 'utf8'), context);
    return context.window.AsciiArtwork;
}

test('idle swaps cached characters at their original tile positions', () => {
    const Artwork = artworkClass(), draws = [];
    const artwork = Object.assign(Object.create(Artwork.prototype), {
        options: { shape: 'arrow' }, height: 100, dpr: 1,
        cells: [{ seed: 42, x: 10, y: 10 }], phase: 0,
        sprite: {}, alternateSprite: {}, waveStates: new Uint8Array(1), tileBoxes: [[0, 0, 8, 8]],
        clear() { assert.fail('idle must not clear or disperse the formed shape'); },
        ctx: { drawImage(...args) { draws.push(args); }, fillText() { assert.fail('idle must reuse cached glyphs'); } },
    });
    artwork.ctx.clearRect = () => {};
    for (let now = 0; now < 9000; now += 100) artwork.idle(now);
    assert.ok(draws.length > 0);
    for (const draw of draws) assert.deepEqual(draw.slice(1, 5), draw.slice(5, 9));
});

test('flight glyphs are rasterized once per colour and shared between particles', () => {
    const text = [];
    const Artwork = artworkClass({ document: { createElement() { return { getContext() { return { fillText(...args) { text.push(args); } }; } }; } } });
    const atlas = Artwork.flightAtlas([['red', 'blue'], ['red', 'blue']], 9, 1.25);
    assert.equal(text.length, 4);
    assert.equal(atlas.tiles[0][0], atlas.tiles[1][0]);
    assert.equal(atlas.tiles[0][1], atlas.tiles[1][1]);
    assert.notDeepEqual(atlas.tiles[0][0][0], atlas.tiles[0][0][1]);
});

test('125% zoom pin rounding reuses the live atlas instead of cancelling the swarm', () => {
    const Artwork = artworkClass();
    const artwork = Object.assign(Object.create(Artwork.prototype), {
        width: 719, height: 678, dpr: 1.25, deviceScale: 1.25,
        canvas: { clientWidth: 719, clientHeight: 679, offsetLeft: 0, offsetTop: 0 },
        flightCanvas: { style: {} },
        build() { assert.fail('a 0.6px pin height change must not rebuild the atlas'); },
    });
    assert.equal(artwork.resize({ width: 719, height: 679 }), false);
    assert.equal(artwork.rect.height, 679);
    assert.equal(artwork.height, 678);
    assert.equal(artwork.flightCanvas.style.height, '679px');
});

test('a scaled footer uses its layout size without rebuilding the artwork', () => {
    const Artwork = artworkClass();
    const artwork = Object.assign(Object.create(Artwork.prototype), {
        canvas: { clientWidth: 1104, clientHeight: 480 },
        options: { shape: 'question' },
        width: 1104, height: 480, deviceScale: 1.25,
        build() { assert.fail('a reveal transform must not rebuild its cached artwork'); },
    });
    assert.equal(artwork.resize({ left: 200, top: 150, width: 795, height: 346 }), false);
    assert.equal(artwork.rect.width, 795);
});

test('cropped glyph atlases still paint cells at their original canvas positions', () => {
    const Artwork = artworkClass(), draws = [], cleared = [];
    const artwork = Object.assign(Object.create(Artwork.prototype), {
        sprite: {}, alternateSprite: {},
        tileBoxes: [[480, 240, 12, 12]], atlasBoxes: [[0, 0, 12, 12]],
        ctx: { clearRect(...args) { cleared.push(args); }, drawImage(...args) { draws.push(args); } },
    });
    artwork.paintCell(0, true);
    assert.deepEqual(cleared[0], [480, 240, 12, 12]);
    assert.deepEqual(draws[0].slice(1), [0, 0, 12, 12, 480, 240, 12, 12]);
});

test('flight projection compensates for a scaled section without escaping its canvas', () => {
    const Artwork = artworkClass(), draws = [];
    const artwork = Object.assign(Object.create(Artwork.prototype), {
        width: 1000, height: 500, dpr: 1,
        rect: { left: 100, top: 200, right: 820, bottom: 560, width: 720, height: 360 },
        canvas: { parentElement: { style: {} } }, flightCanvas: {},
        flightCtx: { drawImage(...args) { draws.push(args); } }, clearFlight() {},
    });
    const viewport = {};
    artwork.paintFlight(viewport, 1440, 900);
    assert.ok(Math.abs(draws[0][1] + 100 / 0.72) < 1e-9);
    assert.ok(Math.abs(draws[0][2] + 200 / 0.72) < 1e-9);
    assert.equal(draws[0][3], 2000);
    assert.equal(draws[0][4], 1250);
});

test('projection uses the real canvas rectangle while the arrow endpoint leaves its pin', () => {
    const Artwork = artworkClass(), draws = [];
    const artwork = Object.assign(Object.create(Artwork.prototype), {
        width: 1000, height: 500, dpr: 1,
        rect: { top: -100, bottom: 400, left: 0, width: 1000, height: 500 },
        displayRect: { top: 0, bottom: 500, left: 0, width: 1000, height: 500 },
        canvas: { parentElement: { style: {} } }, flightCanvas: {},
        flightCtx: { drawImage(...args) { draws.push(args); } }, clearFlight() {},
    });
    artwork.paintFlight({}, 1000, 500);
    assert.equal(draws[0][2], -0);
});

test('the cap keeps its geometry but can swap characters', () => {
    const Artwork = artworkClass();
    const changes = [];
    const artwork = Object.assign(Object.create(Artwork.prototype), {
        options: { shape: 'cap', static: true }, height: 100, phase: 0,
        cells: Array.from({ length: 200 }, (_, seed) => ({ seed, y: 50 })), waveStates: new Uint8Array(200),
        paintCell(index) { changes.push(index); },
        clear() { assert.fail('the cap must keep its position and silhouette'); },
    });
    for (let now = 0; now < 9000; now += 100) artwork.idle(now);
    assert.ok(changes.length > 0);
});

test('each shape including the cap deforms while AFK and reforms after input', () => {
    const Artwork = artworkClass();
    for (const shape of ['cap', 'diploma', 'arrow', 'question']) {
        let restored = 0;
        const draws = [];
        const artwork = Object.assign(Object.create(Artwork.prototype), {
            options: { shape, static: shape === 'cap' }, height: 100, dpr: 1, phase: 0,
            cells: [{ seed: 42, y: 50 }], waveStates: new Uint8Array(1), tileBoxes: [[0, 0, 8, 8]],
            sprite: {}, alternateSprite: {}, bounds() { return { width: 150, height: 100 }; },
            ctx: { drawImage(...args) { draws.push(args); }, clearRect() {} }, clear() {},
            paintFull() { restored++; },
        });
        artwork.idle(1000, 9000);
        assert.equal(artwork.deformAmount, 1);
        assert.notDeepEqual(draws[0].slice(1, 5), draws[0].slice(5, 9));
        const drawn = draws.length;
        artwork.idle(1200, 9200);
        assert.equal(draws.length, drawn, 'the held cloud must reuse its existing frame');
        assert.equal(artwork.isMorphing, false);
        artwork.idle(2000, 0);
        assert.equal(artwork.deformAmount, 0);
        assert.equal(restored, 1);
    }
});
