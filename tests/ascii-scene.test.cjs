const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const motion = require('../ascii-motion.js');

function sceneClass(globals = {}) {
    const context = {
        window: { AsciiMotion: motion, AsciiArtwork: { flightAtlas() { return {}; } }, scrollY: 1000 },
        document: { readyState: 'loading', addEventListener() {} },
        ...globals,
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../ascii-matrix.js'), 'utf8'), context);
    return context.window.AsciiScene;
}

test('a missing diploma still assembles the arrow and leaves the hero untouched', () => {
    const Scene = sceneClass();
    const source = { cells: [], clear() {}, paintFull() {} };
    const arrow = {
        cells: [{ x: 10, y: 20, rgb: [100, 80, 220], alpha: 0.8 }],
        clear() {},
    };
    const scene = {
        stage: 0, width: 900, height: 390, surfaces: [source, arrow],
        hero: { clear() { assert.fail('the static hero must not join transfers'); } },
    };
    Scene.prototype.transfer.call(scene, 1, 100);
    assert.equal(scene.activeRelay.source.virtual, true);
    assert.equal(scene.activeRelay.couriers.length, 1);
    assert.equal(scene.activeRelay.destination, arrow);
    assert.ok(scene.activeRelay.source.cells[0].y >= 1000);
});

test('a relay finishing on a visible destination keeps character swaps scheduled', () => {
    let scheduled = 0;
    const Scene = sceneClass({ setTimeout() { scheduled++; return 123; } });
    const surface = isVisible => ({ isVisible, canvas: { getBoundingClientRect() { return {}; } } });
    const scene = {
        stage: 0, activeRelay: {}, surfaces: [surface(false), surface(true)],
        hero: { isVisible: false }, preference: { matches: false }, hasEntered: true,
        chooseTarget() {}, drawRelay() { this.stage = 1; this.activeRelay = null; }, wake() {},
    };
    Scene.prototype.frame.call(scene, 1000);
    assert.equal(scheduled, 1);
    assert.equal(scene.timer, 123);
});

test('an offscreen deformed hero does not keep a RAF loop running', () => {
    let requested = 0;
    const Scene = sceneClass({ setTimeout() { assert.fail('offscreen artwork must sleep'); } });
    const selected = { rect: {}, isVisible: false, deformAmount: 0.5, canvas: { getBoundingClientRect() { return {}; } } };
    const scene = {
        stage: 0, activeRelay: null, surfaces: [selected], hasEntered: true,
        hero: { isVisible: false, deformAmount: 0.8 }, preference: { matches: false },
        chooseTarget() {}, requestFrame() { requested++; },
    };
    Scene.prototype.frame.call(scene, 1000);
    assert.equal(requested, 0);
});

test('a shape inside a GSAP-hidden wrapper does not keep rendering', () => {
    const Scene = sceneClass({ setTimeout() { assert.fail('hidden artwork must sleep'); } });
    const selected = { rect: {}, isVisible: true, isMorphing: true,
        canvas: { parentElement: { style: { visibility: 'hidden' } } },
        idle() { assert.fail('a hidden wrapper must not redraw its canvas'); },
    };
    const scene = { stage: 1, activeRelay: null, surfaces: [{ rect: {} }, selected], hasEntered: true,
        hero: { isVisible: false }, preference: { matches: false }, chooseTarget() {},
        requestFrame() { assert.fail('hidden artwork must not request RAF'); },
    };
    Scene.prototype.frame.call(scene, 1000);
});

test('the opaque features sheet pauses the hero it covers', () => {
    const Scene = sceneClass({ setTimeout() { return 1; } });
    let updates = 0;
    const selected = { rect: { top: 0, bottom: 1080 }, isVisible: true, idle() { updates++; } };
    const scene = { stage: 0, height: 1080, activeRelay: null, surfaces: [selected], hasEntered: true,
        hero: { isVisible: true, idle() { assert.fail('the covered hero must not redraw'); } },
        preference: { matches: false }, lastInteraction: 0, chooseTarget() {}, wake() {},
    };
    Scene.prototype.frame.call(scene, 1000);
    assert.equal(updates, 1);
});

test('a destination with no visible cells settles without an empty animated delay', () => {
    const Scene = sceneClass();
    let settled;
    const scene = { stage: 0, surfaces: [{ cells: [] }], settle(index) { settled = index; } };
    Scene.prototype.transfer.call(scene, 0, 100);
    assert.equal(settled, 0);
    assert.equal(scene.activeRelay, undefined);
});

test('settling GSAP geometry wakes the hero after the features sheet moves away', () => {
    const Scene = sceneClass({ setTimeout() { return 1; } });
    let updates = 0;
    const selected = { rect: { top: 0, bottom: 720 }, isVisible: false,
        canvas: { getBoundingClientRect() { return { top: 500, bottom: 1220 }; } },
    };
    const scene = { stage: 0, height: 720, activeRelay: null, surfaces: [selected], hasEntered: true,
        geometryUntil: 2000, hero: { isVisible: true, idle() { updates++; } },
        preference: { matches: false }, lastInteraction: 0, chooseTarget() {}, wake() {},
    };
    Scene.prototype.frame.call(scene, 1000);
    assert.equal(updates, 1);
    assert.equal(scene.timer, 1);
});

test('transfers keep the real artwork and its section identity for reversal', () => {
    const Scene = sceneClass();
    const cell = { x: 10, y: 20, seed: 42, rgb: [100, 80, 220], alpha: 0.8 };
    const source = {
        cells: [cell], options: { shape: 'arrow' }, rect: { left: 0, top: 0 },
        clear() {}, paintFull() {},
    };
    const destination = { cells: [cell], clear() {} };
    const scene = { stage: 0, width: 900, height: 390, surfaces: [source, destination] };
    Scene.prototype.transfer.call(scene, 1, 100);
    assert.equal(scene.activeRelay.source, source);
    assert.equal(scene.activeRelay.fromIndex, 0);
    assert.equal(scene.activeRelay.source.cells[0].x, cell.x);
});

test('a transfer starting during AFK keeps its displaced pose anchored to the source', () => {
    const Scene = sceneClass();
    const cell = { seed: 42, x: 10, y: 20, rgb: [100, 80, 220], alpha: 0.8 };
    const source = {
        cells: [cell], rect: { left: 20, top: 100 }, deformAmount: 1, deformSpread: 60,
        clear() {}, paintFull() { assert.fail('preserve the current AFK pose when travel starts'); },
    };
    const destination = { cells: [cell], clear() {} };
    const scene = { stage: 0, width: 900, height: 390, surfaces: [source, destination] };
    Scene.prototype.transfer.call(scene, 1, 100);
    const relay = scene.activeRelay;
    assert.equal(relay.fromIndex, 0);
    assert.equal(relay.source.anchor, source);
    assert.equal(relay.sourcePose.amount, 1);
    const before = Scene.prototype.point.call(scene, relay.source, 0).y;
    source.rect.top = 0;
    assert.ok(Math.abs(Scene.prototype.point.call(scene, relay.source, 0).y - (before - 100)) < 1e-9);
});

test('flight endpoints follow their artwork when ScrollTrigger changes the pin position', () => {
    const Scene = sceneClass();
    const source = { rect: { left: 30, top: 100 }, cells: [{ x: 10, y: 20 }] };
    assert.equal(Scene.prototype.point.call({}, source, 0).y, 120);
    source.rect.top = 25;
    assert.equal(Scene.prototype.point.call({}, source, 0).y, 45);
});

test('flight endpoints follow the displayed scale of the footer card', () => {
    const Scene = sceneClass();
    const surface = { width: 1000, height: 500, rect: { left: 100, top: 200, width: 720, height: 360 }, cells: [{ x: 800, y: 250 }] };
    const point = Scene.prototype.point.call({}, surface, 0);
    assert.equal(point.x, 676);
    assert.equal(point.y, 380);
});

test('settling a transfer restores the selected cached shape without moving its cells', () => {
    const Scene = sceneClass();
    let painted = false;
    const selected = { paintFull() { painted = true; }, clearFlight() {}, idle() { assert.fail('settle must not drift the shape'); } };
    const scene = {
        surfaces: [selected], hasEntered: true,
        ctx: { setTransform() {}, clearRect() {} }, canvas: { width: 100, height: 100 },
    };
    Scene.prototype.settle.call(scene, 0);
    assert.equal(painted, true);
    assert.equal(scene.stage, 0);
    assert.equal(scene.activeRelay, null);
});
