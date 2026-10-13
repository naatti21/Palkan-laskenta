import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// This output is ONLY for a separate staging origin. Never copy it into Pages production.
const rawOrigin = process.env.STAGING_ORIGIN;
if (!rawOrigin) throw new Error('STAGING_ORIGIN is required; no production/default fallback.');
const origin = new URL(rawOrigin);
const local = origin.hostname === '127.0.0.1' && ['4175', '4176'].includes(origin.port);
if (origin.origin !== rawOrigin || origin.hostname === 'naatti21.github.io' ||
    !(local || (origin.protocol === 'https:' && origin.hostname.endsWith('.pages.dev')))) {
  throw new Error('Use an exact HTTPS pages.dev origin or a dedicated local test port.');
}
if (process.env.CF_PAGES && process.env.CF_PAGES_BRANCH !== 'develop') {
  throw new Error('Cloudflare staging must build develop only.');
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const files = ['index.html', 'styles.css', 'app.js', 'parser.js', 'model.js', 'storage.js',
  'learning.js', 'bank-ledger.js', 'bank-ui.js', 'pdf-reader.js', 'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png',
  'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs'];
const hash = createHash('sha256').update(rawOrigin);
for (const file of files) hash.update(await readFile(file));
hash.update(await readFile(new URL(import.meta.url)));
const revision = hash.digest('hex').slice(0, 16);
const output = '_staging';
await rm(output, { recursive: true, force: true }); // Generated directory only; no browser storage.
await mkdir(`${output}/vendor/pdfjs`, { recursive: true });
for (const file of files) await copyFile(file, `${output}/${file}`);
let html = await readFile('index.html', 'utf8');
if (!html.includes('<script type="module" src="./app.js"></script>')) throw new Error('App entry changed; inspect build.');
html = html.replace('<title>Palkka PWA</title>', '<title>Palkka TESTIVERSIO</title>')
  .replace('<body>', '<body>\n  <aside id="staging-banner" style="padding:12px;background:#ffdf80;color:#211900;text-align:center;font-weight:700">TESTIVERSIO · Vain keinotekoiset testitiedot</aside>')
  .replace('<script type="module" src="./app.js"></script>', '<script type="module" src="./staging-entry.mjs"></script>');
await writeFile(`${output}/index.html`, html);
await writeFile(`${output}/staging-entry.mjs`, `const expectedOrigin = ${JSON.stringify(rawOrigin)};
if (location.origin !== expectedOrigin) {
  document.querySelector('main').remove();
  document.getElementById('staging-banner').textContent = 'TESTIVERSIO ESTETTY: väärä origin';
  throw new Error('Staging origin mismatch; app and service worker not started.');
}
await import('./app.js');
`);
const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
manifest.name = 'Palkka TESTIVERSIO';
manifest.short_name = 'Palkka TESTI';
manifest.description = 'Erillinen testiversio. Käytä vain keinotekoisia testitietoja.';
await writeFile(`${output}/manifest.webmanifest`, JSON.stringify(manifest, null, 2) + '\n');
let sw = await readFile('sw.js', 'utf8');
if (!sw.includes('const CACHE_PREFIX = "palkka-pwa-v";') || !sw.includes('const CACHE = `${CACHE_PREFIX}19`;')) {
  throw new Error('Service worker changed; inspect staging cache transformation.');
}
sw = sw.replace('const CACHE_PREFIX = "palkka-pwa-v";', 'const CACHE_PREFIX = "palkka-staging-v";')
  .replace('const CACHE = `${CACHE_PREFIX}19`;', `const CACHE = '${'palkka-staging-v' + revision}';`)
  .replace('"./", "./index.html",', '"./", "./index.html", "./staging-entry.mjs",');
// Enforce the same origin before any worker event handlers can register.
sw = `if (self.location.origin !== ${JSON.stringify(rawOrigin)}) throw new Error('Staging origin mismatch');\n` + sw;
await writeFile(`${output}/sw.js`, sw);
await writeFile(`${output}/build-info.json`, JSON.stringify({ commit, revision, origin: rawOrigin, environment: 'staging' }, null, 2) + '\n');
await writeFile(`${output}/_headers`, '/*\n  X-Robots-Tag: noindex, nofollow\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n');
console.log(`Staging build: ${commit} / ${revision} / ${rawOrigin}`);
