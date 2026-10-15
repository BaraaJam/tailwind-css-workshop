const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

test('page scripts and styles use files shipped with the project', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const resources = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map(match => match[1]);
    assert.ok(resources.length > 0);
    for (const resource of resources) {
        assert.ok(!/^(?:https?:|file:|\/\/)/.test(resource), `External resource: ${resource}`);
        assert.ok(fs.existsSync(path.join(root, resource)), `Missing resource: ${resource}`);
    }
    assert.ok(!/rel="preload"[^>]+as="font"/.test(html), 'a file-origin font preload must not remain');
});

test('font and canvas source images are embedded without file-origin reads', () => {
    const assetPath = path.join(root, 'ascii-assets.js');
    assert.ok(fs.existsSync(assetPath), 'missing embedded ASCII asset bundle');
    const context = { window: {} };
    vm.runInNewContext(fs.readFileSync(assetPath, 'utf8'), context);
    const assets = context.window.AsciiAssets;
    assert.ok(assets.font.startsWith('data:font/woff2;base64,'));
    const font = Buffer.from(assets.font.split(',')[1], 'base64');
    assert.equal(font.subarray(0, 4).toString(), 'wOF2');
    assert.deepEqual(font, fs.readFileSync(path.join(root, 'assets/fonts/recursive-mono.woff2')));
    for (const shape of ['cap', 'diploma', 'arrow', 'question', 'logo']) {
        assert.ok(assets.art[shape].startsWith('data:image/svg+xml;base64,'));
        const svg = Buffer.from(assets.art[shape].split(',')[1], 'base64').toString();
        assert.equal(svg, fs.readFileSync(path.join(root, `assets/matrix/${shape === 'logo' ? 'wordmark' : shape}.svg`), 'utf8'));
        assert.ok(!/(?:href|src)\s*=\s*["'](?:https?:|file:)/.test(svg));
    }
});

test('website fonts are embedded so headings and body text also work from disk', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(/href="assets\/vendor\/fonts\.css"/.test(html), 'website font stylesheet is not linked');
    const css = fs.readFileSync(path.join(root, 'assets/vendor/fonts.css'), 'utf8');
    const fonts = [...css.matchAll(/url\("data:font\/woff2;base64,([^"]+)"\)/g)];
    assert.equal(fonts.length, 2);
    for (const [index, file] of ['head.woff2', 'disc.woff2'].entries()) {
        assert.deepEqual(Buffer.from(fonts[index][1], 'base64'), fs.readFileSync(path.join(root, 'assets/fonts', file)));
    }
    assert.match(css, /font-weight: 100 900/);
    assert.ok(!/src:\s*url\(['"]?assets\/fonts/.test(html));
});
