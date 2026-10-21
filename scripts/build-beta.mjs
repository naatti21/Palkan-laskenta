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
const files = ['index.html', 'styles.css', 'app.js', 'taxcard-forecast.js', 'parser.js', 'model.js', 'storage.js',
  'learning.js', 'analytics.js', 'insights.js', 'insights-ui.js', 'scenario-model.js', 'scenario-ui.js', 'pdf-reader.js', 'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png',
  'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs', 'experiments/year-planner/index.html'];
const hash = createHash('sha256').update(rawOrigin);
for (const file of files) hash.update(await readFile(file));
hash.update(await readFile(new URL(import.meta.url)));
hash.update(await readFile('beta-net-reference-2026.mjs')); // Beta-only tax benchmark invalidates cache
for (const themeFile of ['beta-theme-v2.css', 'beta-planner-theme-v2.css', 'beta-cards-v3.css', 'beta-info-v4.css']) {
  hash.update(await readFile(themeFile)); // changing the visual theme invalidates the Beta offline cache
}
const revision = hash.digest('hex').slice(0, 16);
const output = '_beta';
await rm(output, { recursive: true, force: true }); // Generated directory only; no browser storage.
await mkdir(`${output}/vendor/pdfjs`, { recursive: true });
await mkdir(`${output}/experiments/year-planner`, { recursive: true });
for (const file of files) await copyFile(file, `${output}/${file}`);
await copyFile('beta-net-reference-2026.mjs', `${output}/experiments/year-planner/net-reference-2026.mjs`);
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
html = html.replace(uploadCard, '<section class="card upload-card beta-pdf-slot">');
html = html.replace('<span>Valitse palkkalaskelma PDF</span>',
  '<span>PDF-tuonti</span>');
const betaUploadState = '<p id="status" class="status">Ei ladattua dokumenttia.</p>';
if (!html.includes(betaUploadState)) throw new Error('Upload state marker missing');
html = html.replace(betaUploadState, betaUploadState +
  '<p class="beta-pdf-note">Odottaa tarkistusta · aiempi historia Data-välilehdeltä</p>');
// Display just the important measurements first. Additional known, real values
// stay one tap away in a native details element, with no recalculation.
const dashboardBlock = '<div id="dashboard" class="metrics"></div>';
if (!html.includes(dashboardBlock)) throw new Error('Dashboard target changed; inspect compact Beta layout.');
html = html.replace(dashboardBlock, `<div id="dashboard" class="metrics beta-primary-metrics"></div>
        <section id="taxCardProgress" class="beta-taxcard-progress" aria-labelledby="taxCardProgressTitle">
          <div class="beta-taxcard-heading">
            <strong id="taxCardProgressTitle">Verokortin tuloraja</strong>
            <span id="taxCardPercent">–</span>
          </div>
          <div id="taxCardTrack" class="beta-taxcard-track" role="progressbar" aria-label="Verokortin tulorajan käyttö" aria-valuemin="0" aria-valuemax="100">
            <div id="taxCardFill"></div>
          </div>
          <div id="taxCardRemaining" class="beta-taxcard-remaining">Ei luotettavaa kertymää</div>
          <p id="taxCardEstimate" class="beta-taxcard-estimate" role="status" aria-live="polite">Ei vielä ennustetta.</p>
          <details class="beta-taxcard-provenance">
            <summary>Ennusteen tarkkuus ja tietolähde</summary>
            <p id="taxCardEstimateNote" class="beta-taxcard-note"></p>
            <p id="taxCardContext" class="muted beta-taxcard-context" role="status"></p>
          </details>
        </section>
        <details id="dashboardMore" class="beta-dashboard-more" hidden>
          <summary>Lisää palkkatietoja</summary>
          <div id="dashboardDetails" class="metrics beta-secondary-metrics"></div>
        </details>
        <section id="dashboardMiniChartWrap" class="beta-mini-chart" hidden aria-label="Viimeisimpien maksukuukausien nettoansiot">
          <div class="beta-mini-chart-heading"><strong>Netto / maksukuukausi</strong><span id="dashboardMiniChartScope">Viimeiset kuukaudet</span></div>
          <div id="dashboardMiniChart"></div>
          <p id="dashboardMiniChartCaution" class="beta-mini-chart-caution" hidden></p>
        </section>
      <details class="beta-year-progress" id="yearProgressPanel">
        <summary><strong>Oma vuosisuunnitelma</strong><span id="yearProgressHeadline">Oma tavoite ja toteuma</span></summary>
        <div class="beta-year-progress-content">
          <div class="beta-goal-inputs">
            <label>Oma vuosibruttotavoite (€)<input id="yearGrossGoal" type="number" min="0" max="1000000" step="100" inputmode="decimal" placeholder="Täytä oma tavoite"></label>
            <label>Arvio koko vuoden brutosta (€)<input id="yearGrossForecast" type="number" min="0" max="1000000" step="100" inputmode="decimal" placeholder="Oma arvio, ei automaattinen"></label>
          </div>
          <p id="yearProgressStatus" class="muted" role="status" aria-live="polite">Odottaa tietoja.</p>
          <div class="beta-progress-track" role="img" aria-label="Toteuma suhteessa asetettuun vuosibruttotavoitteeseen">
            <div id="yearProgressFill"></div>
          </div>
          <p id="yearProgressCompare" class="muted"></p>
          <p class="muted">Toteuma perustuu tallennetun palkkalaskelman veronalaiseen vuosikertymään (YTD). Vuoden ennuste on oma arvio, ei automaattinen verolaskelma. Verokortin tuloraja on eri asia kuin oma tulotavoite.</p>
        </div>
      </details>`);
// Keep card-specific tax status near the main KPI metrics; never present it as a full-year limit.
const dashboardNoteMarker = '<p id="dashboardNote" class="muted">Tallenna vähintään yksi palkkalaskelma.</p>';
if (!html.includes(dashboardNoteMarker)) throw new Error('Dashboard note changed');
// The tax-card source note now belongs to its own expandable panel above.
// Avoid repeating the same verokortti explanation below the main dashboard.
const dashboardCard = '<section class="card">\n        <div class="section-heading">\n          <div>\n            <p class="eyebrow">TILANNE</p>';
if (!html.includes(dashboardCard)) throw new Error('Dashboard card changed; inspect compact Beta layout.');
html = html.replace(dashboardCard, '<section class="card beta-compact-dashboard">\n        <div class="section-heading">\n          <div>');
const endTracking = '    </section>\n\n    <section data-view="analysis" class="hidden">';
if (!html.includes(endTracking)) throw new Error('Tracking view boundary changed');
// The compact PDF placeholder already explains disabled import; no duplicate footer.
html = html.replace(endTracking, `    </section>

    <section data-view="analysis" class="hidden">`);
// Apply the UI experiment ONLY inside _beta. The shared index.html stays
// untouched so production and QA staging keep their existing interface.
const analysisMarker = '<section data-view="analysis" class="hidden">';
if (!html.includes(analysisMarker)) throw new Error('Analysis view changed; review Beta integration.');
const plannerCard = `
      <details class="card planner-beta-card planner-fold" aria-labelledby="plannerHeading">
        <summary class="planner-toggle"><strong>Vuoden 2027 suunnittelija</strong><span>Avaa laskuri ja vertaa työviikonloppuja</span></summary>
        <div class="planner-fold-content">
        <p class="eyebrow">BETA · VUOSISUUNNITTELU</p>
        <h2 id="plannerHeading">Enemmän vapaa-aikaa — riittävästi rahaa</h2>
        <p class="muted">Valitse suunnitteluvuosi ja työviikonloput 0–52, vertaa kahta verokorttivaihtoehtoa. Vahvistettu palkkahistoria ehdottaa lähtöarvoja paikallisesti; voit muuttaa niitä.</p>
        <p id="plannerSyncStatus" class="muted" role="status">Valmistellaan palkkahistorian ehdotuksia…</p>
        <iframe id="plannerFrame" class="planner-embed" src="./experiments/year-planner/index.html" title="Vuoden 2027 suunnittelijan laskuri" referrerpolicy="same-origin"></iframe>
        <p class="muted">OmaVeron perus- ja lisäprosentit vahvistetaan erikseen. Kyse on palkkapäivän ennakonpidätysarviosta, ei lopullisesta verosta.</p>
        </div>
      </details>
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
// Keep primary analysis and monthly chart visible; reveal supporting detail only by choice.
const detailStart = '<section class="card">\n        <p class="eyebrow">TODELLINEN MAKSU · ERILLINEN TYÖAJASTA</p>';
const detailEnd = '<section class="card hidden beta-replaced">\n        <p class="eyebrow">OMAT VALINNAT · EI VEROLASKURI</p>';
if (!html.includes(detailStart) || !html.includes(detailEnd)) throw new Error('Analysis detail grouping markers changed.');
html = html.replace(detailStart, `<details class="analysis-collection">
        <summary><strong>Lisää palkka- ja työaikatietoja</strong><span>Brutto, netto, ylityöt, pankkikirjaukset ja kuukausierittely</span></summary>
        <div class="analysis-collection-body">
      ` + detailStart);
html = html.replace(detailEnd, `        </div>
      </details>
      ` + detailEnd);
const budgetStart = '<section class="card">\n        <p class="eyebrow">50 / 30 / 20 · SUUNNITTELUTYÖKALU</p>';
const historyBoundary = '    </section>\n\n    <section data-view="history" class="hidden">';
if (!html.includes(budgetStart) || !html.includes(historyBoundary)) throw new Error('Analysis budget grouping markers changed.');
html = html.replace(budgetStart, `<details class="analysis-collection">
        <summary><strong>Budjetti ja tavoitteet</strong><span>Vapaaehtoiset laskelmat ja omat tavoitteet</span></summary>
        <div class="analysis-collection-body">
      ` + budgetStart);
html = html.replace(historyBoundary, `        </div>
      </details>
    </section>

    <section data-view="history" class="hidden">`);
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
/* Compact, always-visible card-limit gauge. Different from the personal gross goal. */
.beta-taxcard-progress { margin:11px 0 0; padding:11px 12px; border:1px solid rgba(148,163,184,.22); background:rgba(255,255,255,.035); border-radius:12px; }
.beta-taxcard-heading { display:flex; justify-content:space-between; align-items:baseline; gap:10px; font-size:.85rem; }
.beta-taxcard-heading span { font-weight:800; font-size:1.15rem; font-variant-numeric:tabular-nums; color:#e5eefb; }
.beta-taxcard-track { width:100%; height:11px; margin:8px 0; border-radius:99px; overflow:hidden; background:rgba(148,163,184,.22); }
.beta-taxcard-track>div { height:100%; width:0; border-radius:99px; background:#64d5b9; transition:width .2s ease; }
.beta-taxcard-track>div.near-limit { background:#fbbf24; }
.beta-taxcard-track>div.at-limit { background:#f87171; }
.beta-taxcard-remaining { color:#dbeafe; font-weight:700; font-size:.89rem; }
.beta-taxcard-estimate { margin:8px 0 0; line-height:1.4; font-weight:700; font-size:.83rem; color:#eff6ff; }
.beta-taxcard-note { margin:6px 0 0; line-height:1.45; font-size:.72rem; color:#aab4ca; }
.beta-taxcard-progress.is-unavailable .beta-taxcard-track { opacity:.35; }
/* Reserve a single compact import row without enabling the unverified parser. */
.beta-pdf-slot { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 11px; margin:5px 0 7px; border-radius:11px; box-shadow:none; background:rgba(255,255,255,.022); }
.beta-pdf-slot .file-button { display:flex; flex:0 0 auto; width:auto; padding:7px 10px; font-size:.78rem; border:1px dashed rgba(148,163,184,.35); border-radius:9px; background:rgba(255,255,255,.06); color:#d3dbe9; font-weight:650; cursor:not-allowed; opacity:.75; }
.beta-pdf-slot .file-button input { display:none; }
.beta-pdf-slot #status, .beta-pdf-slot .privacy { display:none; }
.beta-pdf-note { color:#aab4ca; font-size:.7rem; line-height:1.3; margin:0; text-align:right; flex:1 1 auto; }
.beta-mini-chart { border-top:1px solid rgba(255,255,255,.10); padding-top:8px; margin-top:8px; }
.beta-mini-chart[hidden] { display:none; }
.beta-mini-chart-heading { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:4px 8px; font-size:.76rem; line-height:1.35; }
.beta-mini-chart-heading strong { color:#e0e9fa; font-size:.80rem; }
.beta-mini-chart-heading span { color:#9baac2; font-size:.7rem; }
.beta-mini-chart svg { display:block; width:100%; max-width:100%; height:auto; max-height:108px; }
.beta-mini-chart-caution { font-size:.68rem; color:#f9c880; margin:3px 0 0; }
.beta-taxcard-context { border-left:2px solid rgba(100,213,185,.4); padding-left:9px; line-height:1.45; }
.beta-year-progress { padding:9px 1px; margin:8px 0 0; border-top:1px solid rgba(255,255,255,.12); background:transparent; box-shadow:none; }
.beta-year-progress > summary { display:flex; justify-content:space-between; flex-wrap:wrap; gap:4px 10px; font-size:.85rem; cursor:pointer; }
.beta-year-progress > summary span { color:#aab4ca; font-size:.76rem; font-weight:450; }
.beta-year-progress-content { margin-top:12px; }
.beta-goal-inputs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
.beta-goal-inputs label { display:grid; gap:5px; font-size:.77rem; color:#cbd5e1; }
.beta-goal-inputs input { width:100%; min-width:0; background:#121a2a; color:#f8fafc; border:1px solid rgba(148,163,184,.35); border-radius:9px; padding:9px 10px; font-size:1rem; }
.beta-year-progress-content .muted { font-size:.76rem; line-height:1.45; margin:9px 0 0; }
.beta-progress-track { height:9px; margin-top:10px; background:rgba(148,163,184,.18); border-radius:9px; overflow:hidden; }
.beta-progress-track > div { width:0; height:100%; background:#64d5b9; border-radius:9px; transition:width .15s ease-out; }
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

const betaPolishCss = `
/* Charcoal and mint Beta-only visual direction. UI data is unchanged. */
:root{color-scheme:dark;background:#13191d;color:#f3f6f4;}
body{background:linear-gradient(180deg,#171c1f,#111719 49%,#171d1e);color:#f3f6f4;}
.shell{max-width:780px;padding:17px 13px 68px;}
.card{background:#242a2e;border-color:rgba(255,255,255,.08);box-shadow:0 7px 23px rgba(0,0,0,.13);border-radius:17px;}
.tabs{background:#191f23;border:1px solid #303a3c;}
.tab.active{background:#323b3c;color:#f3f8f6;}
.beta-heading{letter-spacing:-.04em;}
.beta-tag{color:#b7efd3;border-color:#4a9780;background:#24433a;}
.light.green{color:#6bdfaa;box-shadow:0 0 20px rgba(76,207,159,.24);}
.light.yellow{color:#f2c17a;}
.light.red{color:#f78f97;}
.beta-compact-dashboard{padding:14px;background:#20262a;}
.beta-compact-dashboard h2{font-size:1.16rem;}
.beta-primary-metrics{gap:9px;}
.beta-primary-metrics .metric{min-height:96px;padding:12px;border-radius:14px;background:#2c3235;border:1px solid rgba(255,255,255,.035);align-content:center;}
.beta-primary-metrics .metric:first-child{background:#273b35;border-color:#446d5d;}
.beta-primary-metrics .metric:nth-child(2){background:#273735;border-color:#416b5f;outline:none;}
.beta-primary-metrics .metric strong{font-size:clamp(.95rem,4.2vw,1.32rem);color:#f5f9f7;}
.beta-primary-metrics .metric span{color:#c0cdca;line-height:1.35;}
.beta-taxcard-progress{background:#293235;border-color:#3b4b4b;border-radius:13px;}
.beta-taxcard-heading span{color:#9ae7bc;}
.beta-taxcard-track{background:#3b4848;}
.beta-taxcard-track>div,.beta-progress-track>div{background:#6ce0ac;}
.beta-taxcard-remaining{color:#bfebd6;}
.beta-pdf-slot{background:#22292d;border-color:#33403f;}
.beta-pdf-slot .file-button{background:#31403b;color:#beead4;border-color:#5d8575;}
.beta-dashboard-more>summary{color:#b8e3cb;}
.beta-year-progress>summary span{color:#c0d0ca;}
.beta-mini-chart-heading strong{color:#f1f7f3;}
.beta-taxcard-context{border-left-color:#6ce0ac;}
.beta-compact-months{background:#263030;}
.history-row.payslip-item{display:block;padding:0;margin:10px 0;border:1px solid #3b4746;border-radius:15px;background:#2a3133;overflow:hidden;}
.history-row.payslip-item:first-child{border-top:1px solid #3b4746;}
.history-row.payslip-item[open]{background:#263530;border-color:#64cba0;}
.payslip-summary{display:grid;grid-template-columns:minmax(0,1fr) auto 18px;gap:9px;padding:14px 12px;min-height:74px;align-items:center;cursor:pointer;list-style:none;}
.payslip-summary::-webkit-details-marker{display:none;}
.payslip-heading{display:flex;flex-direction:column;gap:4px;min-width:0;}
.payslip-heading>strong{font-size:.96rem;}
.payslip-heading>span{font-size:.75rem;color:#b6c3bd;overflow-wrap:anywhere;}
.payslip-net{font-size:clamp(.88rem,3.9vw,1.08rem);color:#8cebb7;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;}
.payslip-chevron{font-size:1.25rem;color:#c5dfd1;}
.payslip-item[open] .payslip-chevron{transform:rotate(180deg);}
.payslip-detail{padding:4px 12px 14px;border-top:1px solid rgba(255,255,255,.09);}
.payslip-fields,.payslip-line-list{display:grid;gap:1px;}
.payslip-field{display:flex;justify-content:space-between;gap:14px;padding:9px 1px;border-bottom:1px solid rgba(255,255,255,.075);font-size:.83rem;}
.payslip-field span{color:#becbc4;overflow-wrap:anywhere;}
.payslip-field strong{text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;}
.payslip-footnote{font-size:.75rem;margin:12px 0 0;}
.payslip-lines{margin-top:10px;}
.payslip-lines>summary{cursor:pointer;padding:10px 0;color:#a7eccb;font-size:.85rem;font-weight:650;}
.planner-fold{padding:0;overflow:hidden;}
.planner-toggle{display:grid;gap:6px;cursor:pointer;padding:16px;list-style:none;}
.planner-toggle::-webkit-details-marker{display:none;}
.planner-toggle strong{font-size:1.03rem;}
.planner-toggle span{color:#b8c4c0;font-size:.78rem;}
.planner-toggle::after{content:"Avaa laskuri ↓";color:#8ce0b7;font-size:.77rem;}
.planner-fold[open] .planner-toggle::after{content:"Sulje laskuri ↑";}
.planner-fold-content{padding:1px 10px 12px;}
.analysis-collection{margin:12px 0;border:1px solid #364443;border-radius:15px;background:#252f30;}
.analysis-collection>summary{cursor:pointer;list-style:none;display:grid;gap:5px;padding:16px;}
.analysis-collection>summary::-webkit-details-marker{display:none;}
.analysis-collection>summary strong{font-size:1.02rem;}
.analysis-collection>summary span{color:#b7c3c0;font-size:.77rem;line-height:1.5;}
.analysis-collection>summary::after{content:"Näytä ↓";font-size:.78rem;color:#8ce0b7;}
.analysis-collection[open]>summary::after{content:"Sulje ↑";}
.analysis-collection-body{padding:0 9px 8px;}
.analysis-collection-body>.card{box-shadow:none;background:#2d3738;}
summary:focus-visible{outline:2px solid #9de9c2;outline-offset:2px;}
@media(max-width:620px){
 .shell{padding-left:11px;padding-right:11px;}
 .analysis-collection-body{padding:0 5px 5px;}
 .beta-primary-metrics{grid-template-columns:repeat(2,minmax(0,1fr));}
}
@media(max-width:350px){
 .beta-primary-metrics .metric{padding:8px;}
 .payslip-summary{padding:11px 8px;grid-template-columns:minmax(0,1fr) auto 14px;}
}
`;

// The contrast pass exists only inside the isolated _beta build.
const betaV2Theme = await readFile('beta-theme-v2.css', 'utf8');
const betaCompactV3 = await readFile('beta-cards-v3.css', 'utf8');
const betaInfoV4 = await readFile('beta-info-v4.css', 'utf8');
await writeFile(`${output}/styles.css`,
  (await readFile('styles.css', 'utf8')) + '\n' + betaCss + '\n' + betaPolishCss + '\n' + betaV2Theme + '\n' + betaCompactV3 + '\n' + betaInfoV4);
// Theme the isolated same-origin annual-planner iframe without modifying its source or calculations.
const plannerPath = `${output}/experiments/year-planner/index.html`;
const plannerHtml = await readFile(plannerPath, 'utf8');
if (!plannerHtml.includes('html.beta-integrated body') ||
    plannerHtml.split('</style>').length !== 2) {
  throw new Error('Embedded Beta planner CSS anchor changed; inspect before applying theme.');
}
const plannerV2Theme = await readFile('beta-planner-theme-v2.css', 'utf8');
if (plannerHtml.split('</body>').length !== 2) throw new Error('Beta planner closing body changed; review net preview mounting.');
const plannerWithTheme = plannerHtml.replace('</style>', '\n' + plannerV2Theme + '\n</style>');
await writeFile(plannerPath, plannerWithTheme.replace('</body>',
  '<script type="module" src="./net-reference-2026.mjs"></script>\n</body>'));
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
  .replace('"./app.js", "./parser.js",', '"./app.js", "./taxcard-forecast.js", "./parser.js",')
  .replace('"./icon-192.png", "./icon-512.png"', '"./icon-192.png", "./icon-512.png", "./experiments/year-planner/index.html", "./experiments/year-planner/net-reference-2026.mjs"')
  .replace('"./model.js", "./analytics.js",', '"./model.js", "./analytics.js", "./insights.js", "./insights-ui.js", "./scenario-model.js", "./scenario-ui.js",');
// Enforce the same origin before any worker event handlers can register.
sw = `if (self.location.origin !== ${JSON.stringify(rawOrigin)}) throw new Error('Beta origin mismatch');\n` + sw;
await writeFile(`${output}/sw.js`, sw);
await writeFile(`${output}/build-info.json`, JSON.stringify({ commit, revision, origin: rawOrigin, environment: 'beta' }, null, 2) + '\n');
await writeFile(`${output}/_headers`, '/*\n  X-Robots-Tag: noindex, nofollow\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n');
console.log(`Beta build: ${commit} / ${revision} / ${rawOrigin}`);
