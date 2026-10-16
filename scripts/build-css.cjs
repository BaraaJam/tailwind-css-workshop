const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, [
    require.resolve('tailwindcss/lib/cli.js'),
    '--input', 'styles/tailwind.css', '--content', 'index.html',
    '--output', 'assets/vendor/tailwind.css', '--minify',
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

// Add standard appearance declarations and remove alignment on block media.
const output = path.join(root, 'assets/vendor/tailwind.css');
const css = fs.readFileSync(output, 'utf8')
    .replace(/(?<![\w-])(-webkit-appearance:([^;}]+))(?=[;}])/g, '$1;appearance:$2')
    .replace('display:block;vertical-align:middle', 'display:block');
fs.writeFileSync(output, css);
