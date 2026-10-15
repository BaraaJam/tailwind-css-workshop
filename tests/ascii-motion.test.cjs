const { test } = require('node:test');
const assert = require('node:assert/strict');
const motion = require('../ascii-motion.js');

test('animation uses elapsed time at both 60 Hz and 144 Hz', () => {
    for (const hz of [60, 144]) {
        const tween = motion.createTween(0, 1, 100, 3200);
        for (let frame = 0; frame < hz; frame++) motion.valueAt(tween, 100 + frame * 1000 / hz);
        assert.equal(motion.valueAt(tween, 1700), Math.sin(Math.PI / 4));
        assert.equal(motion.valueAt(tween, 3300), 1);
    }
});

test('reversing a transfer preserves its current position', () => {
    const forward = motion.createTween(0, 1, 0, 3200);
    const before = motion.valueAt(forward, 1100);
    const reverse = motion.retarget(forward, 0, 1100);
    assert.equal(motion.valueAt(reverse, 1100), before);
    assert.equal(motion.valueAt(reverse, 5000), 0);
    assert.ok(motion.valueAt(reverse, 1200) < before);
});

test('scroll direction changes inside a dead zone keep the selected shape', () => {
    const bounds = [{ forward: 396, backward: 330 }, { forward: 5024, backward: 4844 }];
    let stage = motion.stageAt(400, 0, bounds);
    for (const y of [390, 370, 395, 350]) stage = motion.stageAt(y, stage, bounds);
    assert.equal(stage, 1);
    assert.equal(motion.stageAt(329, stage, bounds), 0);
    assert.equal(motion.stageAt(6150, 0, bounds), 2);
    assert.equal(motion.stageAt(0, 2, bounds), 0);
});

test('section arrivals wait until the destination is visible in either scroll direction', () => {
    const bounds = motion.sectionBoundaries({
        heroStart: 0, heroEnd: 2200, solutionsTop: 2920,
        solutionsBottom: 5240, footerTop: 6406, viewportHeight: 720,
    });
    assert.equal(motion.stageAt(500, 0, bounds), 0, 'leaving the hero must not assemble an offscreen arrow');
    assert.equal(motion.stageAt(2500, 0, bounds), 0);
    assert.equal(motion.stageAt(2670, 0, bounds), 1);
    assert.equal(motion.stageAt(5500, 1, bounds), 1, 'wait for the footer before forming the question mark');
    assert.equal(motion.stageAt(6000, 1, bounds), 2);
    assert.equal(motion.stageAt(5500, 2, bounds), 2, 'do not reassemble the arrow above the viewport');
    assert.equal(motion.stageAt(4800, 2, bounds), 1);
    assert.equal(motion.stageAt(2000, 1, bounds), 1);
    assert.equal(motion.stageAt(1800, 1, bounds), 0, 'return to the diploma while its section is visible');
});

test('cell mapping preserves each source and destination exactly once at rest', () => {
    const cells = count => Array.from({ length: count }, (_, i) => ({ x: i * 10, y: i * 5, alpha: 0.2 + i * 0.01 }));
    for (const [a, b] of [[3, 8], [8, 3], [5, 5]]) {
        const from = cells(a), to = cells(b);
        const couriers = motion.makeCouriers(from, to);
        assert.equal(couriers.length, Math.max(a, b));
        for (let i = 0; i < a; i++) assert.equal(couriers.filter(c => c.from === i).reduce((s, c) => s + c.alphaFrom, 0), from[i].alpha);
        for (let i = 0; i < b; i++) assert.equal(couriers.filter(c => c.to === i).reduce((s, c) => s + c.alphaTo, 0), to[i].alpha);
        assert.deepEqual(couriers, motion.makeCouriers(from, to));
    }
    assert.deepEqual(motion.makeCouriers([], cells(5)), []);
});

test('every staggered cell can leave home and reach its destination', () => {
    const cells = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 40 - i, alpha: 1 }));
    for (const courier of motion.makeCouriers(cells, cells)) {
        assert.equal(motion.cellProgress(courier, 0), 0);
        assert.equal(motion.cellProgress(courier, 1), 1);
    }
});

test('curved paths meet their endpoints without a positional jump', () => {
    const from = { x: 15, y: 90 }, to = { x: 800, y: -300 };
    assert.deepEqual(motion.curvePoint(from, to, { x: 20, y: -50 }, 0), from);
    assert.deepEqual(motion.curvePoint(from, to, { x: 20, y: -50 }, 1), to);
});

test('render resolution respects the pixel budget on large and high-DPI screens', () => {
    for (const [w, h, dpr] of [[390, 844, 3], [1280, 720, 2], [7680, 4320, 2]]) {
        const scale = motion.pixelRatio(w, h, dpr);
        assert.ok(w * h * scale * scale <= 1500001);
        assert.ok(scale <= dpr);
    }
});

test('pinning subpixel height changes reuse the same raster cache', () => {
    assert.deepEqual(motion.rasterSize(1920, 1080, 1), motion.rasterSize(1920, 1079.9998779296875, 1));
    assert.notDeepEqual(motion.rasterSize(1920, 1080, 1), motion.rasterSize(1920, 900, 1));
});

test('idle waves repeat after seven seconds and leave most rows unchanged', () => {
    assert.ok(Math.abs(motion.wave(0.5, 3500, 0) - 1) < 1e-9);
    assert.equal(motion.wave(0.1, 3500, 0), 0);
    assert.ok(Math.abs(motion.wave(0.5, 3500, 0) - motion.wave(0.5, 10500, 0)) < 1e-9);
});

test('offscreen endpoints enter near the viewport so travel remains visible', () => {
    const from = motion.flightEndpoint({ x: 200, y: -4000 }, 1080);
    const to = motion.flightEndpoint({ x: 500, y: 450 }, 1080);
    assert.ok(from.y >= -260 && from.y < 0);
    assert.equal(to.y, 450);
    const middle = motion.curvePoint(from, to, { x: 0, y: 0 }, 0.5);
    assert.ok(middle.y > 0 && middle.y < 1080);
    assert.ok(motion.flightEndpoint({ x: 0, y: 8000 }, 1080).y < 1340);
    assert.ok(Math.abs(motion.flightEndpoint({ x: 0, y: -30.001 }, 1080).y + 30) < 0.002);
});

test('AFK deformation starts after 3.5 seconds, deforms slower, holds, and reforms', () => {
    assert.equal(motion.afkPulse(3400), 0);
    assert.equal(motion.afkPulse(3500), 0);
    assert.ok(motion.afkPulse(4400) > 0 && motion.afkPulse(4400) < 1);
    assert.equal(motion.afkPulse(5500), 1);
    assert.equal(motion.afkPulse(6500), 1);
    assert.ok(motion.afkPulse(8400) > 0 && motion.afkPulse(8400) < 1);
    assert.equal(motion.afkPulse(9600), 0);
    assert.equal(motion.afkPulse(14500), motion.afkPulse(5500));
    const cell = { seed: 12 };
    assert.equal(motion.deformOffset(cell, 0, 100).x, 0);
    assert.ok(Math.abs(motion.deformOffset(cell, 1, 100).x) > 0);
});
