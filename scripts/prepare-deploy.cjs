const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'dist');
const files = new Set(['index.html']);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/gi)) {
    const reference = match[1];
    if (/^(?:[a-z]+:|\/\/|#)/i.test(reference)) continue;
    files.add(reference.split(/[?#]/)[0]);
}
// These licenses also cover the fonts and vectors embedded in the JS/CSS bundles.
for (const license of [
    'assets/fonts/Inter-LICENSE.txt', 'assets/fonts/OFL.txt',
    'assets/matrix/TABLER-LICENSE', 'assets/vendor/lenis-LICENSE.txt',
]) files.add(license);

// Validate the complete input list before replacing this workspace's generated folder.
for (const file of files) {
    const source = path.resolve(root, file);
    if (!source.startsWith(root + path.sep) || !fs.statSync(source).isFile()) {
        throw new Error(`Invalid deployment file: ${file}`);
    }
}
if (path.dirname(output) !== root || path.basename(output) !== 'dist') {
    throw new Error('Deployment output must be the workspace dist directory.');
}
fs.rmSync(output, { recursive: true, force: true });
for (const file of files) {
    const destination = path.join(output, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
}
console.log(`Prepared ${files.size} website files in dist/.`);
