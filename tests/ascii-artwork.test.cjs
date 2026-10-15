const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const motion = require('../ascii-motion.js');

function artworkClass() {
    const context = { window: { AsciiMotion: motion, devicePixelRatio: 1.25 } };
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

test('125% zoom pin rounding reuses the live atlas instead of cancelling the swarm', () => {
    const Artwork = artworkClass();
    const artwork = Object.assign(Object.create(Artwork.prototype), {
        width: 719, height: 678, dpr: 1.25, deviceScale: 1.25,
        build() { assert.fail('a 0.6px pin height change must not rebuild the atlas'); },
    });
    assert.equal(artwork.resize({ width: 719, height: 679 }), false);
    assert.equal(artwork.rect.height, 679);
    assert.equal(artwork.height, 678);
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
        artwork.idle(1000, 5500);
        assert.equal(artwork.deformAmount, 1);
        assert.notDeepEqual(draws[0].slice(1, 5), draws[0].slice(5, 9));
        artwork.idle(2000, 0);
        assert.equal(artwork.deformAmount, 0);
        assert.equal(restored, 1);
    }
});
