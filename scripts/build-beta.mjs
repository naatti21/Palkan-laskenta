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
  .replace('<h1>Palkka</h1>', '<h1 class="beta-heading">Palkka <span id="beta-tag" class="beta-tag">BETA</span></h1>')
  .replace('<p class="eyebrow">PAIKALLINEN PALKANSEURANTA</p>', '')
  .replace('<p>Palkkalaskelma sisään. Sovellus muistaa, seuraa ja huomaa muutokset puolestasi.</p>', '')
  .replace('<script type="module" src="./app.js"></script>', '<script type="module" src="./beta-entry.mjs"></script>');
// This is a data-review beta. Import trusted structured backups to analyze them,
// but do not let an unapproved PDF parser automatically create new pay records.
if (!html.includes('<input id="pdfInput" type="file" accept="application/pdf" />')) {
  throw new Error('PDF input changed; review beta safety gate.');
}
html = html.replace(
  '<input id="pdfInput" type="file" accept="application/pdf" />',
  '<input id="pdfInput" type="file" accept="application/pdf" disabled />'
);
const uploadCard = '<section class="card upload-card">';
if (!html.includes(uploadCard)) throw new Error('Beta upload card missing; review safety gate.');
html = html.replace(uploadCard, '<section class="card upload-card hidden beta-disabled-upload">');
// Display just the important measurements first. Additional known, real values
// stay one tap away in a native details element, with no recalculation.
const dashboardBlock = '<div id="dashboard" class="metrics"></div>';
if (!html.includes(dashboardBlock)) throw new Error('Dashboard target changed; inspect compact Beta layout.');
html = html.replace(dashboardBlock, `<div id="dashboard" class="metrics beta-primary-metrics"></div>
        <details id="dashboardMore" class="beta-dashboard-more" hidden>
          <summary>Lisää palkkatietoja</summary>
          <div id="dashboardDetails" class="metrics beta-secondary-metrics"></div>
        </details>`);
const dashboardCard = '<section class="card">\n        <div class="section-heading">\n          <div>\n            <p class="eyebrow">TILANNE</p>';
if (!html.includes(dashboardCard)) throw new Error('Dashboard card changed; inspect compact Beta layout.');
html = html.replace(dashboardCard, '<section class="card beta-compact-dashboard">\n        <div class="section-heading">\n          <div>');
const endTracking = '    </section>\n\n    <section data-view="analysis" class="hidden">';
if (!html.includes(endTracking)) throw new Error('Tracking view boundary changed');
html = html.replace(endTracking, `      <p id="beta-tracking-tip" class="beta-tracking-tip">PDF-tuonti on Betassa pois käytöstä. Palkkahistorian saat mukaan kohdasta <strong>Data → Palauta varmuuskopio</strong>.</p>
    </section>

    <section data-view="analysis" class="hidden">`);
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
// Only the isolated generated Beta CSS gets compact mobile-first styling.
const betaCss = `
/* Compact Beta dashboard. Shared production stylesheet is never overwritten. */
.beta-heading { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin:0; }
.beta-tag { display:inline-flex; padding:3px 7px; vertical-align:middle; font-size:.66rem; letter-spacing:.07em; line-height:1.3; font-weight:800; border-radius:6px; color:#c4f1df; border:1px solid rgba(100,213,185,.4); background:rgba(100,213,185,.1); }
.hero { padding:7px 2px 5px; align-items:center; }
.hero h1 { font-size:clamp(1.75rem,6.5vw,2.35rem); letter-spacing:-.035em; }
.hero .light { width:30px; height:30px; font-size:1.35rem; }
.tabs { margin:2px 0 8px; }
.beta-compact-dashboard { margin:6px 0 3px; padding:12px; }
.beta-compact-dashboard .section-heading { margin-bottom:9px; }
.beta-compact-dashboard h2 { font-size:1.08rem; margin:0; }
.beta-compact-dashboard .year-select { min-width:78px; padding:5px 8px; }
.beta-primary-metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
.beta-primary-metrics .metric { padding:10px; min-width:0; gap:4px; }
.beta-primary-metrics .metric strong { font-size:clamp(.90rem,3.9vw,1.2rem); line-height:1.25; letter-spacing:-.025em; overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
.beta-primary-metrics .metric span { font-size:.72rem; line-height:1.3; }
.beta-primary-metrics .metric:nth-child(2) { background:rgba(100,213,185,.07); outline:1px solid rgba(100,213,185,.15); }
.beta-dashboard-more { margin:7px 0 0; border-top:1px solid rgba(255,255,255,.1); }
.beta-dashboard-more[hidden] { display:none; }
.beta-dashboard-more > summary { padding:9px 2px 3px; font-weight:650; font-size:.82rem; color:#aabbd3; cursor:pointer; }
.beta-secondary-metrics { margin-top:7px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
.beta-secondary-metrics .metric { padding:8px 9px; min-width:0; }
.beta-secondary-metrics .metric strong { font-size:.94rem; overflow-wrap:anywhere; }
.beta-compact-dashboard #dashboardNote { margin:9px 0 0; line-height:1.4; font-size:.77rem; }
.beta-tracking-tip { margin:8px 6px 16px; color:#aab4ca; font-size:.76rem; line-height:1.45; }
@media(max-width:360px) {
  .beta-primary-metrics .metric { padding:9px 7px; }
  .beta-compact-dashboard { padding:10px; }
  .beta-primary-metrics .metric strong { font-size:.92rem; }
}
`;
await writeFile(`${output}/styles.css`, (await readFile('styles.css', 'utf8')) + '\n' + betaCss);
await writeFile(`${output}/index.html`, html);
await writeFile(`${output}/beta-entry.mjs`, `const expectedOrigin = ${JSON.stringify(rawOrigin)};
if (location.origin !== expectedOrigin) {
  document.querySelector('main')?.remove();
  document.body.textContent = 'BETA ESTETTY: väärä origin';
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
