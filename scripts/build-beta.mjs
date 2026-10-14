import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// This output is ONLY for the separate beta origin. Never copy it into main GitHub Pages or QA staging.
const rawOrigin = process.env.BETA_ORIGIN;
if (!rawOrigin) throw new Error('BETA_ORIGIN is required; no production/default fallback.');
const origin = new URL(rawOrigin);
const local = origin.hostname === '127.0.0.1' && ['4177', '4178'].includes(origin.port);
const published = origin.protocol === 'https:' && origin.hostname === 'palkka-beta.pages.dev';
if (origin.origin !== rawOrigin || origin.hostname === 'naatti21.github.io' ||
    !(local || published)) {
  throw new Error('Use only the approved palkka-beta.pages.dev origin or a dedicated local beta test port.');
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const files = ['index.html', 'styles.css', 'app.js', 'parser.js', 'model.js', 'storage.js',
  'learning.js', 'analytics.js', 'insights.js', 'insights-ui.js', 'scenario-model.js', 'scenario-ui.js', 'pdf-reader.js', 'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png',
  'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs', 'experiments/year-planner/index.html'];
const hash = createHash('sha256').update(rawOrigin);
for (const file of files) hash.update(await readFile(file));
hash.update(await readFile(new URL(import.meta.url)));
const revision = hash.digest('hex').slice(0, 16);
const output = '_beta';
await rm(output, { recursive: true, force: true }); // Generated directory only; no browser storage.
await mkdir(`${output}/vendor/pdfjs`, { recursive: true });
await mkdir(`${output}/experiments/year-planner`, { recursive: true });
for (const file of files) await copyFile(file, `${output}/${file}`);
let html = await readFile('index.html', 'utf8');
if (!html.includes('<script type="module" src="./app.js"></script>')) throw new Error('App entry changed; inspect build.');
html = html.replace('<title>Palkka PWA</title>', '<title>Palkka BETA</title>')
  .replace('<body>', '<body>\n  <aside id="beta-banner" style="padding:12px;background:#f1d4ff;color:#33164b;text-align:center;font-weight:700">BETA · Kokeiluversio · Säilytä tuotannon varmuuskopio</aside>')
  .replace('<script type="module" src="./app.js"></script>', '<script type="module" src="./beta-entry.mjs"></script>');
// This is a data-review beta. Import trusted structured backups to analyze them,
// but do not let an unapproved PDF parser automatically create new pay records.
if (!html.includes('<input id="pdfInput" type="file" accept="application/pdf" />')) {
  throw new Error('PDF input changed; review beta safety gate.');
}
html = html.replace(
  '<input id="pdfInput" type="file" accept="application/pdf" />',
  '<input id="pdfInput" type="file" accept="application/pdf" disabled />'
).replace('Valitse palkkalaskelma PDF',
  'PDF-tuonti odottaa parserin QA-tarkastusta · tuo nykyinen historia Data-välilehdeltä');
// Apply the UI experiment ONLY inside _beta. The shared index.html stays
// untouched so production and QA staging keep their existing interface.
const analysisMarker = '<section data-view="analysis" class="hidden">';
if (!html.includes(analysisMarker)) throw new Error('Analysis view changed; review Beta integration.');
const plannerCard = `
      <section class="card planner-beta-card" aria-labelledby="plannerHeading">
        <p class="eyebrow">BETA · VUOSISUUNNITTELU</p>
        <h2 id="plannerHeading">Enemmän vapaa-aikaa — riittävästi rahaa</h2>
        <p class="muted">Valitse suunnitteluvuosi ja työviikonloput 0–52, vertaa kahta verokorttivaihtoehtoa. Vahvistettu palkkahistoria ehdottaa lähtöarvoja paikallisesti; voit muuttaa niitä.</p>
        <p id="plannerSyncStatus" class="muted" role="status">Valmistellaan palkkahistorian ehdotuksia…</p>
        <iframe id="plannerFrame" class="planner-embed" src="./experiments/year-planner/index.html" title="Vuoden 2027 suunnittelijan laskuri" referrerpolicy="same-origin"></iframe>
        <p class="muted">OmaVeron perus- ja lisäprosentit vahvistetaan erikseen. Kyse on palkkapäivän ennakonpidätysarviosta, ei lopullisesta verosta.</p>
      </section>
`;
html = html.replace(analysisMarker, analysisMarker + plannerCard);
for (const heading of [
  'Työn ja palkan aikajana',
  'Mitä lisätyöstä jää?',
  'Milloin seuraavasta eurosta jää vähemmän?',
  'Mitä seuraavat viikonloput tuottaisivat?'
]) {
  const at = html.indexOf('<h2>' + heading + '</h2>');
  if (at === -1) throw new Error('Missing Beta card: ' + heading);
  const start = html.lastIndexOf('<section class="card">', at);
  if (start === -1 || at - start > 450) throw new Error('Cannot safely hide Beta card: ' + heading);
  html = html.slice(0, start) + html.slice(start).replace('<section class="card">', '<section class="card hidden beta-replaced">');
}
const monthPanel = `      <section class="card">
        <p class="eyebrow">AVAA KUUKAUSI</p>
        <h2>Kuukausien erittely</h2>
        <div id="monthlyDetails" class="insight-rows"></div>
      </section>`;
if (!html.includes(monthPanel)) throw new Error('Month detail block changed');
html = html.replace(monthPanel,`      <details class="card beta-compact-months">
        <summary>Kuukausien erittely · avaa tarvittaessa</summary>
        <div id="monthlyDetails" class="insight-rows"></div>
      </details>`);
const budgetLabel = '<label class="insight-label">Valitse maksettu kuukausi';
if (!html.includes(budgetLabel)) throw new Error('Budget section changed');
html = html.replace(budgetLabel,`<label class="insight-label">Nettotulon lähde
          <select id="budgetSource" class="year-select">
            <option value="typical" selected>Tyypillinen kuukausi · viimeiset palkkanauhat</option>
            <option value="latest">Viimeisin palkkalaskelma</option>
            <option value="month">Valittu toteutunut kuukausi</option>
          </select>
        </label>
        ` + budgetLabel);
await writeFile(`${output}/index.html`, html);
await writeFile(`${output}/beta-entry.mjs`, `const expectedOrigin = ${JSON.stringify(rawOrigin)};
if (location.origin !== expectedOrigin) {
  document.querySelector('main')?.remove();
  document.getElementById('beta-banner').textContent = 'BETA ESTETTY: väärä origin';
  throw new Error('Beta origin mismatch; app and service worker not started.');
}
await import('./app.js');
`);
const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
manifest.name = 'Palkka BETA';
manifest.id = './palkka-beta';
manifest.short_name = 'Palkka BETA';
manifest.description = 'Erillinen beta-versio. Palkkatiedot tallentuvat vain tähän selaimeen.';
await writeFile(`${output}/manifest.webmanifest`, JSON.stringify(manifest, null, 2) + '\n');
let sw = await readFile('sw.js', 'utf8');
if (!sw.includes('const CACHE_PREFIX = "palkka-pwa-v";') || !sw.includes('const CACHE = `${CACHE_PREFIX}17`;')) {
  throw new Error('Service worker changed; inspect staging cache transformation.');
}
sw = sw.replace('const CACHE_PREFIX = "palkka-pwa-v";', 'const CACHE_PREFIX = "palkka-beta-v";')
  .replace('const CACHE = `${CACHE_PREFIX}17`;', `const CACHE = '${'palkka-beta-v' + revision}';`)
  .replace('"./", "./index.html",', '"./", "./index.html", "./beta-entry.mjs",')
  .replace('"./icon-192.png", "./icon-512.png"', '"./icon-192.png", "./icon-512.png", "./experiments/year-planner/index.html"')
  .replace('"./model.js", "./analytics.js",', '"./model.js", "./analytics.js", "./insights.js", "./insights-ui.js", "./scenario-model.js", "./scenario-ui.js",');
// Enforce the same origin before any worker event handlers can register.
sw = `if (self.location.origin !== ${JSON.stringify(rawOrigin)}) throw new Error('Beta origin mismatch');\n` + sw;
await writeFile(`${output}/sw.js`, sw);
await writeFile(`${output}/build-info.json`, JSON.stringify({ commit, revision, origin: rawOrigin, environment: 'beta' }, null, 2) + '\n');
await writeFile(`${output}/_headers`, '/*\n  X-Robots-Tag: noindex, nofollow\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n');
console.log(`Beta build: ${commit} / ${revision} / ${rawOrigin}`);
