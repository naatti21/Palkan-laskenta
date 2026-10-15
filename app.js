import { extractPdfText } from "./pdf-reader.js";
import { buildYearAnalysis } from "./analytics.js";
import { forecastTaxCardLimit } from "./taxcard-forecast.js";
import { initInsightsUi, renderInsightsUi } from "./insights-ui.js";
import {initScenarioUi,renderScenarioUi} from "./scenario-ui.js";
import { parsePayslip, validate } from "./parser.js";
import {
  applyLearnedMappings,
  learnMappingsFromCorrections,
  mergeMappingUpdates,
  sanitizeMappings
} from "./learning.js";
import {
  VALUE_KEYS,
  applyUserCorrections,
  makeBackup,
  makeRecordFromParsed,
  parseBackup,
  parseBackupLearnedProfiles,
  paymentState,
  findRecordConflict
} from "./model.js";
import {
  clearAllRecords,
  getAllRecords,
  mergeManyRecords,
  migrateLegacyLocalStorage,
  upsertRecord,
  replaceRecord,
  saveRecordSeparately,
  getSetting,
  setSetting
} from "./storage.js";

let currentParsed = null;
let currentRawText = "";
let currentFingerprint = "";
let currentRecord = null;
let deferredInstallPrompt = null;
let selectedYear = null;
let currentLearnedProfile = null;
let currentReviewWasManualConfirmation = false;
let currentPendingRecord = null;
let currentConflict = null;
let currentPendingWasAutoParsed = false;
const LEARNED_PROFILES_KEY = "learnedLayoutProfiles:v1";

const fieldLabels = {
  payPeriodStart: "Palkkakausi alkaa",
  payPeriodEnd: "Palkkakausi päättyy",
  payDate: "Maksupäivä",
  grossPay: "Brutto / veronalainen palkka",
  netPay: "Netto",
  ytdTaxableIncome: "Veronalainen YTD",
  previousYearTaxableIncome: "Edellisen vuoden veronalainen",
  taxCardAccumulatedIncome: "Verokortin kertymä",
  withholdingPeriod: "Ennakonpidätys / jakso",
  withholdingYtd: "Ennakonpidätys YTD",
  taxRate: "Perusprosentti",
  taxLimit: "Tuloraja",
  additionalRate: "Lisäprosentti",
  kta: "KTA",
  pp: "PP",
  overtime100DailyHours: "OT 100 % vrk (h)",
  overtime50WeeklyHours: "OT 50 % vko (h)",
  overtime100WeeklyHours: "OT 100 % vko (h)",
  overtimeHours: "OT yhteensä (h)",
  overtimeCompensation: "OT-korotukset (€)",
  sundayHours: "Sunnuntaityö (h)",
  weeklyRestHours: "Viikkovapaa (h)",
  worktimeBankUseHours: "Työaikapankista käyttö (h)",
  worktimeBankAddHours: "Työaikapankin lisäys (h)"
};

const requiredFields = ["payDate", "grossPay", "netPay", "ytdTaxableIncome"];
const dateFields = new Set(["payPeriodStart", "payPeriodEnd", "payDate"]);
const moneyFields = new Set([
  "grossPay", "netPay", "ytdTaxableIncome", "previousYearTaxableIncome", "taxCardAccumulatedIncome",
  "withholdingPeriod", "withholdingYtd", "taxLimit", "kta", "pp", "overtimeCompensation"
]);
const percentFields = new Set(["taxRate", "additionalRate"]);

function fmtFieldValue(key, value) {
  if (value == null || value === "") return "–";
  if (dateFields.has(key)) return fmtDate(value);
  if (moneyFields.has(key)) return fmtMoney(value);
  if (percentFields.has(key)) return `${fmtNumber(value)} %`;
  return fmtNumber(value);
}

const el = id => document.getElementById(id);
const fmtMoney = n => n == null ? "–" : new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" }).format(n);
const fmtNumber = n => n == null ? "–" : new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 2 }).format(n);
const fmtDate = iso => iso ? new Intl.DateTimeFormat("fi-FI").format(new Date(`${iso}T12:00:00`)) : "–";

function setView(name) {
  for (const button of document.querySelectorAll("[data-view-target]")) {
    button.classList.toggle("active", button.dataset.viewTarget === name);
  }
  for (const view of document.querySelectorAll("[data-view]")) {
    view.classList.toggle("hidden", view.dataset.view !== name);
  }
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function safeFingerprintPayload(parsed) {
  const values = Object.fromEntries(VALUE_KEYS.map(key => [key, parsed.fields?.[key]?.value ?? null]));
  const payLines = (parsed.payLines || []).map(line => ({
    code: line.code ?? null,
    label: line.label ?? null,
    category: line.category ?? "unknown",
    quantity: line.quantity ?? null,
    unitPrice: line.unitPrice ?? null,
    amount: line.amount ?? null
  }));
  return JSON.stringify({ values, payLines });
}

function normalizedSignals(signals) {
  return [...new Set((signals || []).filter(value => typeof value === "string" && value.length <= 80))].sort();
}

function profileId(signals) {
  return normalizedSignals(signals).join("|");
}

function profileSimilarity(a, b) {
  const A = new Set(normalizedSignals(a));
  const B = new Set(normalizedSignals(b));
  if (A.size < 3 || B.size < 3) return 0;
  const intersection = [...A].filter(value => B.has(value)).length;
  const union = new Set([...A, ...B]).size;
  return union ? intersection / union : 0;
}

async function getLearnedProfiles() {
  const value = await getSetting(LEARNED_PROFILES_KEY);
  return Array.isArray(value) ? value : [];
}

async function setLearnedProfiles(profiles) {
  const safe = (profiles || []).slice(0, 100).map(profile => ({
    id: String(profile.id || profileId(profile.signals)).slice(0, 120),
    signals: normalizedSignals(profile.signals).slice(0, 30),
    observations: Math.max(0, Math.min(9999, Number(profile.observations) || 0)),
    confirmations: Math.max(0, Math.min(999, Number(profile.confirmations) || 0)),
    autoParses: Math.max(0, Math.min(9999, Number(profile.autoParses) || 0)),
    mappings: sanitizeMappings(profile.mappings),
    sourceProfile: String(profile.sourceProfile || "learned-local").slice(0, 80),
    firstSeenAt: profile.firstSeenAt || null,
    lastSeenAt: profile.lastSeenAt || null
  })).filter(profile => profile.signals.length >= 3);
  await setSetting(LEARNED_PROFILES_KEY, safe);
  return safe;
}

async function findLearnedProfile(signals) {
  const profiles = await getLearnedProfiles();
  let best = null;
  let bestScore = 0;
  for (const profile of profiles) {
    const score = profileSimilarity(signals, profile.signals);
    if (score > bestScore) { best = profile; bestScore = score; }
  }
  if (bestScore < 0.8 || !best) return null;
  const trusted = (best.confirmations || 0) > 0 || (best.autoParses || 0) >= 2;
  return { ...best, score: bestScore, trusted };
}

async function applyProfileMappings(parsed, rawText, profile) {
  if (!profile?.mappings?.length) return { parsed, appliedFields: [] };
  const learnedValues = await applyLearnedMappings(rawText, profile.mappings);
  const appliedFields = [];

  for (const [field, value] of Object.entries(learnedValues)) {
    const meta = parsed.fields?.[field];
    // Learned mappings must not suppress parser-detected value conflicts.
    if (meta?.conflict || meta?.evidenceIssue) continue;
    if (!meta || meta.value == null || Number(meta.confidence || 0) < 0.95) {
      parsed.fields[field] = {
        value,
        confidence: 0.965,
        source: "Paikallinen vahvistettu kenttäkartta"
      };
      appliedFields.push(field);
    }
  }

  if (!appliedFields.length) return { parsed, appliedFields };

  const requiredFound = requiredFields.filter(key => parsed.fields?.[key]?.value != null).length;
  parsed.overallConfidence = requiredFound / requiredFields.length;
  parsed.notices = validate(parsed.fields);
  parsed.warnings = parsed.notices.map(notice => notice.message);

  if (requiredFound >= 3 && (parsed.documentType === "payslip" || profile.trusted || (parsed.signals || 0) >= 3)) {
    parsed.documentType = "payslip";
  }
  parsed.sourceProfile = `${parsed.sourceProfile || "generic-text-pdf"}+learned-local`;
  return { parsed, appliedFields };
}

async function rememberCurrentStructure({ confirmed = false, autoParsed = false, mappingUpdates = [] } = {}) {
  const signals = normalizedSignals(currentParsed?.structureSignals);
  if (signals.length < 3) return null;
  const profiles = await getLearnedProfiles();
  const now = new Date().toISOString();
  const existingIndex = profiles.findIndex(profile => profileSimilarity(signals, profile.signals) >= 0.8);
  let profile;
  if (existingIndex >= 0) {
    const previous = profiles[existingIndex];
    profile = {
      ...previous,
      signals: [...new Set([...(previous.signals || []), ...signals])].sort(),
      observations: Math.max(previous.observations || 0, previous.confirmations || 0) + 1,
      confirmations: (previous.confirmations || 0) + (confirmed ? 1 : 0),
      autoParses: (previous.autoParses || 0) + (autoParsed ? 1 : 0),
      mappings: mergeMappingUpdates(previous.mappings, mappingUpdates),
      lastSeenAt: now
    };
    profiles[existingIndex] = profile;
  } else {
    profile = {
      id: profileId(signals).slice(0, 120),
      signals,
      observations: 1,
      confirmations: confirmed ? 1 : 0,
      autoParses: autoParsed ? 1 : 0,
      mappings: sanitizeMappings(mappingUpdates),
      sourceProfile: currentParsed?.sourceProfile || "learned-local",
      firstSeenAt: now,
      lastSeenAt: now
    };
    profiles.push(profile);
  }
  await setLearnedProfiles(profiles);
  return profile;
}

async function mergeLearnedProfiles(incoming) {
  const profiles = await getLearnedProfiles();
  for (const item of incoming || []) {
    const signals = normalizedSignals(item.signals);
    if (signals.length < 3) continue;
    const i = profiles.findIndex(profile => profileSimilarity(signals, profile.signals) >= 0.8);
    if (i >= 0) {
      profiles[i] = {
        ...profiles[i],
        signals: [...new Set([...(profiles[i].signals || []), ...signals])].sort(),
        observations: Math.max(profiles[i].observations || 0, item.observations || 0),
        confirmations: Math.max(profiles[i].confirmations || 0, item.confirmations || 0),
        autoParses: Math.max(profiles[i].autoParses || 0, item.autoParses || 0),
        mappings: mergeMappingUpdates(profiles[i].mappings, item.mappings),
        lastSeenAt: profiles[i].lastSeenAt || item.lastSeenAt || null
      };
    } else profiles.push(item);
  }
  return setLearnedProfiles(profiles);
}

function refreshRecordNotices(record) {
  const fields = Object.fromEntries(VALUE_KEYS.map(key => [key, { value: record.values?.[key] ?? null }]));
  record.notices = validate(fields);
  return record;
}

function blockingNotices(parsed) {
  return (parsed.notices || []).filter(n => n.level === "blocking");
}

function problemKeys(parsed) {
  const keys = new Set();
  for (const key of requiredFields) {
    const meta = parsed.fields[key];
    if (!meta || meta.value == null || meta.confidence < .95) keys.add(key);
  }
  for (const notice of blockingNotices(parsed)) {
    for (const key of notice.fields || []) keys.add(key);
  }
  return [...keys];
}

function canAutoAccept(parsed) {
  if (parsed.documentType !== "payslip") return false;
  if (blockingNotices(parsed).length) return false;
  return requiredFields.every(key => {
    const meta = parsed.fields[key];
    return meta?.value != null && meta.confidence >= .95;
  });
}

function fieldDisplay(key, value) {
  if (dateFields.has(key)) return fmtDate(value);
  if (moneyFields.has(key)) return fmtMoney(value);
  if (percentFields.has(key)) return value == null ? "–" : `${fmtNumber(value)} %`;
  return value == null ? "–" : fmtNumber(value);
}

function valueOf(record, key) {
  return record?.values?.[key] ?? null;
}

function detectedCategories(record) {
  const tags = [];
  if ((valueOf(record, "overtimeHours") ?? 0) > 0) tags.push(`✓ Ylityö ${fmtNumber(valueOf(record, "overtimeHours"))} h`);
  if ((valueOf(record, "sundayHours") ?? 0) > 0) tags.push(`✓ Sunnuntai ${fmtNumber(valueOf(record, "sundayHours"))} h`);
  if ((valueOf(record, "weeklyRestHours") ?? 0) > 0) tags.push(`✓ Viikkovapaa ${fmtNumber(valueOf(record, "weeklyRestHours"))} h`);
  if ((valueOf(record, "worktimeBankUseHours") ?? 0) !== 0 || (valueOf(record, "worktimeBankAddHours") ?? 0) !== 0) tags.push("✓ Työaikapankki");
  if ((record.payLines?.length || 0) > 0) tags.push(`✓ ${record.payLines.length} palkkariviä`);
  if (!tags.length) tags.push("✓ Ydintiedot");
  return tags;
}

function renderRecordNotices(record) {
  const host = el("resultNotices");
  host.innerHTML = "";
  const notices = (record.notices || []).filter(n => n.level !== "blocking");
  if (!notices.length) {
    host.classList.add("hidden");
    return;
  }
  host.classList.remove("hidden");
  for (const notice of notices) {
    const item = document.createElement("p");
    item.textContent = notice.message;
    host.append(item);
  }
}

function renderSuccess(record, mergedDuplicate = false) {
  currentRecord = record;
  currentPendingRecord = null;
  currentConflict = null;
  currentPendingWasAutoParsed = false;
  el("reviewSection").classList.add("hidden");
  el("unknownSection").classList.add("hidden");
  el("conflictSection")?.classList.add("hidden");
  el("resultSection").classList.remove("hidden");
  el("resultBadge").textContent = mergedDuplicate ? "Päivitetty" : "Tallennettu";

  const state = paymentState(record);
  if (state === "confirmed_future") {
    el("resultTitle").textContent = "Tuleva palkka vahvistettu";
    el("resultSubtitle").textContent = "Palkkalaskelma on saatu ennen maksupäivää. Se kuuluu seurantaan normaalisti.";
  } else if (record.taxYear && record.taxYear !== new Date().getFullYear()) {
    el("resultTitle").textContent = `Palkkalaskelma tallennettu vuodelle ${record.taxYear}`;
    el("resultSubtitle").textContent = "Vanha palkkalaskelma lisättiin oikean vuoden historiaan.";
  } else {
    el("resultTitle").textContent = "Palkkalaskelma tallennettu";
    el("resultSubtitle").textContent = "Tunnistus onnistui varmasti. Voit jatkaa ilman erillistä tarkistusta.";
  }

  const summary = el("resultSummary");
  summary.innerHTML = "";
  const rows = [
    ["Maksupäivä", fmtDate(valueOf(record, "payDate"))],
    ["Brutto", fmtMoney(valueOf(record, "grossPay"))],
    ["Netto", fmtMoney(valueOf(record, "netPay"))],
    ["YTD", fmtMoney(valueOf(record, "ytdTaxableIncome"))]
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "summary-row";
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    summary.append(row);
  }

  const tags = el("detectedTags");
  tags.innerHTML = "";
  for (const label of detectedCategories(record)) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = label;
    tags.append(tag);
  }
  renderRecordNotices(record);
}

function renderUnknown() {
  el("resultSection").classList.add("hidden");
  el("reviewSection").classList.add("hidden");
  el("conflictSection")?.classList.add("hidden");
  el("unknownSection").classList.remove("hidden");
  el("status").textContent = "Dokumenttia ei tallennettu.";
}

function currentInputValue(key, parsed) {
  if (currentRecord?.values && Object.prototype.hasOwnProperty.call(currentRecord.values, key)) {
    return currentRecord.values[key];
  }
  return parsed.fields?.[key]?.value ?? null;
}

function renderReview(parsed, keys = null, manual = false) {
  el("resultSection").classList.add("hidden");
  el("unknownSection").classList.add("hidden");
  el("conflictSection")?.classList.add("hidden");
  el("reviewSection").classList.remove("hidden");

  const isPartial = Array.isArray(keys) && keys.length > 0;
  el("reviewEyebrow").textContent = manual ? "KÄSIN TÄYTTÖ" : isPartial ? "TARVITSEN TARKISTUKSEN" : "MUOKKAUS";
  el("reviewTitle").textContent = manual ? "Täytä palkkalaskelman ydintiedot" : isPartial ? "Tarkista vain nämä kohdat" : "Muokkaa tietoja";
  if (manual && currentParsed?.structureSignals?.length >= 3) {
    el("reviewIntro").textContent = "Tämä palkkalaskelman rakenne on uusi. Täytä ydintiedot kerran. Sovellus muistaa vain rakenteen tunnisteet tällä laitteella — ei nimeä, työnantajaa, henkilötunnusta tai PDF:n raakatekstiä. Epävarmat arvot kysytään jatkossakin.";
  } else if (currentLearnedProfile && isPartial) {
    el("reviewIntro").textContent = "Tunnistan tämän aiemmin vahvistetuksi rakenteeksi, mutta nämä arvot jäivät epävarmoiksi. Tarkista vain näkyvät kohdat.";
  } else {
    el("reviewIntro").textContent = manual
      ? "Täytä vähintään maksupäivä, brutto, netto ja vuoden veronalainen kertymä. Muita kenttiä voi lisätä tarvittaessa."
      : isPartial
        ? "Palkkalaskelma tunnistettiin, mutta nämä kohdat tarvitsevat varmistuksen. Korjaus auttaa muistamaan tämän rakenteen paikallisesti. Muita tietoja ei tarvitse käydä läpi."
        : "Muuta vain sitä, mikä on väärin. Käyttäjän korjaus säilytetään parserin alkuperäisen arvon rinnalla.";
  }
  el("showAllButton").classList.toggle("hidden", !isPartial && !manual);

  const visible = isPartial || manual ? new Set(keys || requiredFields) : new Set(Object.keys(fieldLabels));
  const grid = el("reviewGrid");
  grid.innerHTML = "";

  for (const notice of blockingNotices(parsed)) {
    const warning = document.createElement("div");
    warning.className = "inline-warning blocking";
    warning.textContent = notice.message;
    grid.append(warning);
  }

  for (const [key, label] of Object.entries(fieldLabels)) {
    if (!visible.has(key)) continue;
    const meta = parsed.fields?.[key] || { value: null, confidence: 0, source: null };
    const wrapper = document.createElement("label");
    wrapper.className = `review-field ${meta.value == null || (meta.confidence > 0 && meta.confidence < .9) ? "uncertain" : ""}`;
    const title = document.createElement("span");
    title.className = "field-label";
    title.textContent = label;
    const input = document.createElement("input");
    input.dataset.key = key;
    input.type = dateFields.has(key) ? "date" : "text";
    const value = currentInputValue(key, parsed);
    input.value = value ?? "";
    if (!dateFields.has(key)) input.inputMode = "decimal";
    wrapper.append(title, input);
    if (!manual && (meta.value == null || (meta.confidence > 0 && meta.confidence < .9))) {
      const hint = document.createElement("small");
      hint.textContent = Array.isArray(meta.candidates) && meta.candidates.length > 1
        ? `Havaitut vaihtoehdot: ${meta.candidates.map(value => fmtFieldValue(key, value)).join(" / ")}. Vahvista oikea arvo.`
        : meta.source ? `Lähde: ${meta.source}` : "Ei tunnistettu";
      wrapper.append(hint);
    }
    grid.append(wrapper);
  }
}

function collectEditedValues() {
  const edited = {};
  for (const input of document.querySelectorAll("#reviewGrid input[data-key]")) {
    const key = input.dataset.key;
    if (dateFields.has(key)) edited[key] = input.value || null;
    else edited[key] = input.value.trim() === "" ? null : Number(input.value.replace(/\s/g, "").replace(",", "."));
  }
  return edited;
}

function makeManualParsed() {
  const fields = {};
  for (const key of VALUE_KEYS) fields[key] = { value: null, confidence: 0, source: "Käsin syötetty" };
  return {
    documentType: "payslip",
    parserVersion: "manual-0.3",
    sourceProfile: "manual-entry",
    fields,
    payLines: [],
    overallConfidence: 0,
    notices: []
  };
}

function taxStatus(record) {
  const taxLimit = valueOf(record, "taxLimit");
  const accumulated = valueOf(record, "taxCardAccumulatedIncome");
  if (taxLimit == null) return { light: "neutral", text: "Tulorajaa ei löytynyt" };
  if (accumulated == null) return { light: "neutral", text: "Verokortin kertymä puuttuu" };
  const ratio = accumulated / taxLimit;
  if (ratio > 1) return { light: "red", text: "Tuloraja ylitetty" };
  if (ratio >= .9) return { light: "yellow", text: "Tuloraja lähestyy" };
  return { light: "green", text: "Tuloraja kunnossa" };
}

function sortByPayDate(records, direction = 1) {
  return [...records].sort((a, b) => ((valueOf(a, "payDate") || "").localeCompare(valueOf(b, "payDate") || "")) * direction);
}

function availableYears(records) {
  return [...new Set(records.map(r => r.taxYear).filter(Boolean))].sort((a, b) => b - a);
}

function syncYearSelectors(records) {
  const years = availableYears(records);
  if (!selectedYear || !years.includes(selectedYear)) selectedYear = years[0] ?? new Date().getFullYear();
  for (const id of ["dashboardYear", "historyYear", "analysisYear"]) {
    const select = el(id);
    select.innerHTML = "";
    if (!years.length) {
      const option = document.createElement("option");
      option.value = String(selectedYear);
      option.textContent = String(selectedYear);
      select.append(option);
      continue;
    }
    for (const year of years) {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = String(year);
      option.selected = year === selectedYear;
      select.append(option);
    }
  }
}

// Planner runs as a same-origin, non-persistent experiment inside the Beta.
// Source records stay in the browser; only the Palkka backup's structured fields
// are passed in memory. Never write the planner suggestions into payroll records.
let plannerRecords = [];
let plannerReady = false;
let plannerObserver = null;
function syncPlannerHistory() {
  const frame = el('plannerFrame');
  if (!frame || !plannerReady || !frame.contentWindow) return;
  frame.contentWindow.postMessage({ type: 'palkka:planner:prefill', backup: makeBackup(plannerRecords) }, location.origin);
  const note = el('plannerSyncStatus');
  if (note) note.textContent = plannerRecords.length
    ? `Historiasta saatavilla ${plannerRecords.filter(r => r.kind !== 'forecast').length} tietuetta. Ehdotukset näkyvät alla ja ovat muokattavissa.`
    : 'Historiaa ei vielä ole. Suunnittelijaa voi käyttää esimerkkiluvuilla.';
}
function initPlannerBridge() {
  const frame = el('plannerFrame');
  if (!frame) return;
  const loaded = () => {
    // Intentionally refuse a cross-origin embedded planner.
    let doc;
    try { doc = frame.contentDocument; if (!doc || frame.contentWindow.location.origin !== location.origin) return; }
    catch { el('plannerSyncStatus').textContent = 'Suunnittelijan alkuperä ei täsmää. Historiatietoja ei välitetä.'; return; }
    plannerReady = true;
    plannerObserver?.disconnect();
    const resize = () => {
      const next = Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0) + 12);
      if (Number.isFinite(next) && next > 200 && next < 25000) frame.style.height = next + 'px';
    };
    resize();
    if (doc.body && 'ResizeObserver' in window) {
      plannerObserver = new ResizeObserver(resize);
      plannerObserver.observe(doc.body);
    }
    syncPlannerHistory();
  };
  frame.addEventListener('load', loaded);
  if (frame.contentDocument?.readyState === 'complete') loaded();
}

// Beta-only year progress: no implied tax forecast from partial payslips.
// User-owned values live in existing local IndexedDB settings, keyed by year.
let yearProgressLoadedYear = null;
let yearProgressRecords = [];
const progressKey = (year, kind) => "beta:year-progress:v1:" + year + ":" + kind;
async function loadYearProgressValues() {
  const goal = document.getElementById("yearGrossGoal");
  if (!goal || yearProgressLoadedYear === selectedYear) return;
  const year = selectedYear;
  const [storedGoal, storedForecast] = await Promise.all([
    getSetting(progressKey(year, "goal")), getSetting(progressKey(year, "forecast"))
  ]);
  if (selectedYear !== year) return;
  goal.value = storedGoal == null ? "" : String(storedGoal);
  el("yearGrossForecast").value = storedForecast == null ? "" : String(storedForecast);
  yearProgressLoadedYear = year;
}
function readYearProgressNumber(id) {
  const field = document.getElementById(id);
  if (!field || field.value.trim() === "") return null;
  const n = Number(field.value);
  return Number.isFinite(n) && n > 0 && n <= 1000000 ? n : null;
}
function renderBetaYearProgress(records) {
  const headline = document.getElementById("yearProgressHeadline");
  if (!headline) return;
  const info = buildYearAnalysis(records, selectedYear);
  const goal = readYearProgressNumber("yearGrossGoal");
  const forecast = readYearProgressNumber("yearGrossForecast");
  // A duplicate/contradictory pay-period record disqualifies this YTD snapshot.
  const actual = info.conflictingRecords === 0 && info.payslips > 0 &&
    typeof info.latestYtd === "number" && Number.isFinite(info.latestYtd) &&
    info.latestYtd >= 0 ? info.latestYtd : null;
  const status = el("yearProgressStatus"), comparison = el("yearProgressCompare");
  const fill = el("yearProgressFill");
  fill.style.width = goal && actual !== null ? Math.min(100,actual/goal*100) + "%" : "0%";
  if (goal === null) {
    headline.textContent = "Aseta oma tulotavoite";
    status.textContent = actual === null ? "Ei luotettavaa veronalaista vuosikertymää." :
      "Kertyneet veronalaiset ansiot " + fmtMoney(actual) + " (palkkalaskelman YTD).";
  } else if (actual === null) {
    headline.textContent = "Tavoite " + fmtMoney(goal);
    status.textContent = info.conflictingRecords ? "Ristiriitaiset palkkatiedot: toteumaa ei verrata tavoitteeseen." :
      "Toteuma puuttuu. Tavoite " + fmtMoney(goal) + " on asetettu vuodelle " + selectedYear + ".";
  } else {
    headline.textContent = fmtMoney(actual) + " / " + fmtMoney(goal);
    const difference = goal - actual;
    status.textContent = difference >= 0
      ? "Palkkalaskelman YTD " + fmtMoney(actual) + ". Tavoitteesta jäljellä " + fmtMoney(difference) + "."
      : "Palkkalaskelman YTD " + fmtMoney(actual) + ". Oma tavoite ylittynyt " + fmtMoney(-difference) + ".";
  }
  if (forecast === null) comparison.textContent = "Koko vuoden ennuste: ei asetettu. Emme arvaa puuttuvien kuukausien tuloja.";
  else if (goal === null) comparison.textContent = "Oma koko vuoden bruttoarvio " + fmtMoney(forecast) + ". Aseta myös tavoite vertailua varten.";
  else {
    const diff = forecast - goal;
    comparison.textContent = "Oma koko vuoden bruttoarvio " + fmtMoney(forecast) +
      (diff < 0 ? " · " + fmtMoney(-diff) + " alle tavoitteen." : diff > 0
        ? " · " + fmtMoney(diff) + " yli tavoitteen." : " · täsmää tavoitteeseen.");
  }
}
function initBetaYearProgress() {
  if (!document.getElementById("yearGrossGoal")) return;
  for (const [id, kind] of [["yearGrossGoal","goal"],["yearGrossForecast","forecast"]]) {
    const field = el(id);
    field.addEventListener("input", () => renderBetaYearProgress(yearProgressRecords));
    field.addEventListener("change", async () => {
      const raw = field.value.trim();
      const parsed = raw === "" ? null : Number(raw);
      if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1000000)) {
        field.setCustomValidity("Syötä positiivinen euroarvo, enintään 1 000 000.");
        field.reportValidity();
        return;
      }
      field.setCustomValidity("");
      await setSetting(progressKey(selectedYear, kind), parsed === null ? null : String(parsed));
    });
  }
}

async function renderAll() {
  const records = await getAllRecords();
  plannerRecords = records;
  syncPlannerHistory();
  syncYearSelectors(records);
  await loadYearProgressValues();
  yearProgressRecords = records;
  renderDashboard(records);
  renderBetaYearProgress(records);
  renderAnalysis(records);
  renderInsightsUi(records, selectedYear);
  await renderScenarioUi(records, selectedYear);
  renderHistory(records);
  renderDataSummary(records);
  await renderLearnedProfileSummary();
}

// A small, optional Beta-only visual: observed monthly net payments by pay date.
// Uses the same conflict-excluding analytics as the full analysis tab. No forecast
// records, interpolation, zeros for missing months, or private record transfer.
function renderBetaDashboardTrend(records) {
  const wrap = document.getElementById("dashboardMiniChartWrap");
  if (!wrap) return;
  const host = document.getElementById("dashboardMiniChart");
  const scope = document.getElementById("dashboardMiniChartScope");
  const caution = document.getElementById("dashboardMiniChartCaution");
  host.replaceChildren();
  wrap.hidden = true;
  const year = buildYearAnalysis(records, selectedYear);
  const observed = year.months.filter(m => m.payslips > 0 &&
    m.conflictingRecords === 0 && typeof m.net === "number" &&
    Number.isFinite(m.net) && m.net >= 0).slice(-6);
  if (observed.length < 2) return;
  const excluded = year.months.some(m => m.conflictingRecords > 0);
  caution.hidden = !excluded;
  caution.textContent = excluded ? "Ristiriitaiset maksukuukaudet jätetty pois." : "";
  scope.textContent = observed.length + " kk · vain tallennetut";
  const ns = "http://www.w3.org/2000/svg";
  const node = (tag, attrs = {}) => {
    const n = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, String(value));
    return n;
  };
  const svg = node("svg", {
    viewBox: "0 0 320 108", preserveAspectRatio: "xMidYMid meet",
    role: "img", "aria-label": "Tallennetut nettopalkat maksukuukausittain (maksupäivien määrä voi vaihdella): " +
      observed.map(m => m.label + " " + fmtMoney(m.net)).join(", ")
  });
  const max = Math.max(1, ...observed.map(m => m.net));
  svg.append(node("line", { x1: 6, y1: 84, x2: 314, y2: 84,
    stroke: "rgba(148,163,184,.38)", "stroke-width": 1 }));
  observed.forEach((month, index) => {
    const x = 12 + (index + .5) * 296 / observed.length;
    const height = Math.max(1, 65 * month.net / max);
    const bar = node("rect", {
      x: x - Math.min(18, 92 / observed.length),
      y: 84 - height, width: Math.min(36, 184 / observed.length),
      height, rx: 4, fill: "#72b7f6"
    });
    const title = node("title");
    title.textContent = month.label + ": " + fmtMoney(month.net) + " nettoa, maksupäivän mukaan";
    bar.append(title);
    svg.append(bar);
    const label = node("text", {
      x, y: 100, fill: "#aab4ca", "text-anchor": "middle", "font-size": 11
    });
    label.textContent = month.label;
    svg.append(label);
  });
  host.append(svg);
  wrap.hidden = false;
}

// The Beta card shows current card progress independently of the user's own annual goal.
function renderTaxCardProgress(records, latest, ambiguous) {
  const host = document.getElementById("taxCardProgress");
  if (!host) return;
  const summary = forecastTaxCardLimit(records, selectedYear);
  const valid = Boolean(latest) && !ambiguous && summary.valid;
  host.classList.toggle("is-unavailable", !valid);
  const track = el("taxCardTrack");
  const fill = el("taxCardFill");
  const pct = el("taxCardPercent");
  const amount = el("taxCardRemaining");
  const eta = el("taxCardEstimate");
  const detail = el("taxCardEstimateNote");
  if (!valid) {
    pct.textContent = "–";
    amount.textContent = "Ei luotettavaa kertymää";
    eta.textContent = ambiguous ? "Ristiriitainen palkkalaskelma – tarkista historia." : "Ei vielä ennustetta.";
    detail.textContent = "Tarvitaan viimeisimmältä palkkalaskelmalta sekä verokortin tuloraja että kortin oma kertymä.";
    track.removeAttribute("aria-valuenow");
    fill.style.width = "0%";
    fill.className = "";
    return;
  }
  const used = Math.max(0, summary.percent);
  pct.textContent = fmtNumber(used) + " %";
  amount.textContent = "Jäljellä " + fmtMoney(summary.remaining);
  eta.textContent = summary.estimate;
  detail.textContent = summary.caveat;
  track.setAttribute("aria-valuenow", String(Math.min(100, used)));
  track.setAttribute("aria-valuetext", fmtNumber(used) + " prosenttia verokortin tulorajasta käytetty");
  fill.style.width = Math.min(100, used) + "%";
  fill.className = used >= 100 ? "at-limit" : used >= 90 ? "near-limit" : "";
}

function renderDashboard(records) {
  // Beta ignores forecast records in this card. The original production view
  // retains its existing source selection until separately audited.
  const secondaryDash = document.getElementById("dashboardDetails");
  const yearRecords = records.filter(r => r.taxYear === selectedYear && (!secondaryDash || r.kind !== "forecast"));
  const latest = sortByPayDate(yearRecords).at(-1);
  const dash = el("dashboard");
  dash.replaceChildren();
  secondaryDash?.replaceChildren();
  const betaPrimary = secondaryDash
    ? new Set(["Netto", "Tulorajaa jäljellä"])
    : null;
  const overall = el("overallLight");
  renderBetaDashboardTrend(records);
  const morePanel = document.getElementById("dashboardMore");
  if (morePanel) morePanel.hidden = !latest;

  if (!latest) {
    overall.className = "light neutral";
    overall.textContent = "–";
    el("dashboardNote").textContent = `Vuodelta ${selectedYear} ei ole vielä palkkalaskelmia.`;
    renderTaxCardProgress(yearRecords, null, false);
    const context = document.getElementById("taxCardContext");
    if (context) context.textContent = "Verokortin tietoja ei voi päätellä ilman palkkalaskelmaa. Oma vuositavoite on erillinen tieto.";
    return;
  }

  const lastDate = valueOf(latest, "payDate");
  const samePeriod = row => valueOf(row, "payDate") === lastDate &&
    valueOf(row, "payPeriodStart") === valueOf(latest, "payPeriodStart") &&
    valueOf(row, "payPeriodEnd") === valueOf(latest, "payPeriodEnd");
  const ambiguous = Boolean(secondaryDash) && yearRecords.filter(samePeriod).length > 1;
  const limit = valueOf(latest, "taxLimit");
  const accumulated = valueOf(latest, "taxCardAccumulatedIncome");
  const cardKnown = !ambiguous && typeof limit === "number" && Number.isFinite(limit) && limit > 0 &&
    typeof accumulated === "number" && Number.isFinite(accumulated) && accumulated >= 0;
  renderTaxCardProgress(yearRecords, latest, ambiguous);
  const status = ambiguous ? {light:"neutral",text:"Saman palkkakauden ristiriita"}
    : taxStatus(latest);
  overall.className = `light ${status.light}`;
  overall.textContent = status.light === "neutral" ? "–" : "●";

  const remaining = secondaryDash
    ? (cardKnown ? limit - accumulated : null)
    : limit != null && accumulated != null ? limit - accumulated : null;
  const cardContext = document.getElementById("taxCardContext");
  if (cardContext) {
    const prior = yearRecords.filter(r => r !== latest && valueOf(r, "payDate") < lastDate);
    // Do not compare naturally increasing card accumulation. Only compare
    // explicitly observed limit and tax-rate fields, when both values exist.
    const altered = prior.some(r => ["taxLimit","taxRate","additionalRate"].some(key => {
      const before = valueOf(r,key), after = valueOf(latest,key);
      return typeof before==="number" && Number.isFinite(before) &&
        typeof after==="number" && Number.isFinite(after) && Math.abs(before-after)>.005;
    }));
    cardContext.textContent = ambiguous
      ? "Saman palkkakauden tietueissa on ristiriita. Kortin tulorajamarginaalia ei näytetä ennen Historian tarkistusta."
      : !cardKnown
      ? "Viimeisimmästä palkkalaskelmasta puuttuu luotettava verokortin tuloraja tai kertymä. Tarkista voimassa oleva kortti OmaVerosta."
      : altered
      ? "Palkkalaskelmissa on eri verokortin tuloraja tai prosentti. Näytetään vain viimeisimmän laskelman ("+fmtDate(lastDate)+") kortin marginaali — vanhoja rajoja ei lasketa yhteen. Vahvista ajantasainen koko vuoden tuloraja OmaVerosta."
      : "Verokortin luvut ovat viimeisimmästä palkkalaskelmasta ("+fmtDate(lastDate)+"), eivät vahvistus tämän päivän kortista tai koko vuoden ansiorajasta. Tarkista OmaVerosta.";
  }
  const metrics = [
    ["Viimeisin maksupäivä", fmtDate(valueOf(latest, "payDate"))],
    ["Brutto", fmtMoney(valueOf(latest, "grossPay"))],
    ["Netto", fmtMoney(valueOf(latest, "netPay"))],
    ["Veronalainen YTD", fmtMoney(valueOf(latest, "ytdTaxableIncome"))],
    ["Verokortin kertymä", fmtMoney(secondaryDash && !cardKnown ? null : valueOf(latest, "taxCardAccumulatedIncome"))],
    ["Tuloraja", fmtMoney(secondaryDash && !cardKnown ? null : valueOf(latest, "taxLimit"))],
    ["Tulorajaa jäljellä", fmtMoney(remaining)],
    ["OT viime jaksolla", `${fmtNumber(valueOf(latest, "overtimeHours"))} h`]
  ];
  // Keep the most useful pair visible first on phone: recent net and remaining
  // tax-card margin. All other original metrics remain accessible on one tap.
  const primaryOrder = ["Netto", "Tulorajaa jäljellä"];
  const visibleMetrics = betaPrimary
    ? [...primaryOrder.map(label => metrics.find(row => row[0] === label)),
       ...metrics.filter(row => !betaPrimary.has(row[0]))]
    : metrics;
  for (const [label, value] of visibleMetrics) {
    const box = document.createElement("div");
    box.className = "metric";
    const shownLabel = !secondaryDash ? label :
      ({Netto:"Viimeisin netto", "Tulorajaa jäljellä":"Kortin marginaali",
        "Verokortin kertymä":"Kortin kertymä", Tuloraja:"Kortin tuloraja"})[label] || label;
    box.innerHTML = `<span>${shownLabel}</span><strong>${value}</strong>`;
    (betaPrimary && !betaPrimary.has(label) ? secondaryDash : dash).append(box);
  }

  const state = paymentState(latest);
  const stateText = state === "confirmed_future" ? " Viimeisin laskelma on vahvistettu tuleva palkka." : "";
  el("dashboardNote").textContent = secondaryDash
    ? `${status.text} (viimeisin palkkalaskelma).${stateText}`
    : `${status.text}. Tulorajaa verrataan vain verokortin omaan kertymään.${stateText}`;
}


function renderAnalysis(records) {
  const info = buildYearAnalysis(records, selectedYear);
  const metrics = el("analysisMetrics");
  metrics.replaceChildren();
  function metric(label, value) {
    const box = document.createElement("div");
    box.className = "metric";
    const title = document.createElement("span");
    title.textContent = label;
    const amount = document.createElement("strong");
    amount.textContent = value;
    box.append(title, amount);
    metrics.append(box);
  }
  const warning = info.conflictingRecords
    ? `Huomio: ${info.conflictingRecords} ristiriitaista tietuetta ei lasketa yhteissummiin. Tarkista ne Historiasta.`
    : "Mukana vain tallennetut laskelmat, ei arvioita puuttuvilta kuukausilta.";
  el("analysisNote").textContent = info.payslips
    ? `${info.payslips} palkkalaskelmaa. ${warning}`
    : "Ei tallennettuja palkkalaskelmia valitulle vuodelle.";
  metric("Tallennettujen laskelmien brutto", fmtMoney(info.totalGross));
  metric("Tallennettujen laskelmien netto", fmtMoney(info.totalNet));
  metric("Viimeisimmän laskelman YTD", fmtMoney(info.latestYtd));
  const overtime = info.overtime;
  metric("Maksetut ylityötunnit / kirjattu", overtime.recordsWithHours
    ? `${fmtNumber(overtime.knownHours)} h ${overtime.complete ? "" : "(osittainen)"}`
    : "Ei tietoa");
  const coverage = document.createElement("p");
  coverage.className = "muted analysis-coverage";
  coverage.textContent = `Ylityötietoa ${overtime.recordsWithHours}/${overtime.recordsTotal - overtime.excludedConflicts} yksiselitteisestä laskelmasta.`
    + (overtime.complete ? "" : " Puuttuva tieto ei ole nolla.");
  metrics.append(coverage);

  const host = el("monthlyChart");
  host.replaceChildren();
  const validMonths = info.months.filter(m => m.payslips > 0);
  if (!validMonths.length) {
    host.textContent = "Ei kuukausitietoja.";
    return;
  }
  const max = Math.max(1, ...validMonths.map(m => Math.max(m.gross || 0, m.net || 0)));
  for (const month of validMonths) {
    const row = document.createElement("div");
    row.className = "chart-row";
    const monthLabel = document.createElement("span");
    monthLabel.className = "chart-month-label";
    monthLabel.textContent = month.label;
    const bars = document.createElement("div");
    bars.className = "chart-bars";
    const amount = document.createElement("span");
    amount.className = "chart-amount";
    if (!month.complete) {
      bars.textContent = "Tarkistettavaa";
      amount.textContent = "–";
    } else {
      for (const [kind, value] of [["gross", month.gross], ["net", month.net]]) {
        const bar = document.createElement("div");
        bar.className = `chart-bar chart-bar-${kind}`;
        bar.style.width = `${Math.max(0, Math.min(100, value / max * 100))}%`;
        bar.title = `${kind === "gross" ? "Brutto" : "Netto"}: ${fmtMoney(value)}`;
        bars.append(bar);
      }
      amount.textContent = fmtMoney(month.net);
    }
    row.append(monthLabel, bars, amount);
    host.append(row);
  }
}

function renderHistory(records) {
  const host = el("history");
  const yearRecords = records.filter(r => r.taxYear === selectedYear);
  if (!yearRecords.length) {
    host.innerHTML = `<p class="muted">Ei tallennettuja laskelmia vuodelta ${selectedYear}.</p>`;
    return;
  }
  host.innerHTML = "";
  for (const record of sortByPayDate(yearRecords, -1)) {
    const row = document.createElement("div");
    row.className = "history-row";
    const state = paymentState(record);
    const stateLabel = state === "confirmed_future" ? '<span class="mini-state">Vahvistettu tuleva</span>' : "";
    row.innerHTML = `
      <div>
        <strong>${fmtDate(valueOf(record, "payDate"))}</strong>
        <span>${fmtDate(valueOf(record, "payPeriodStart"))}–${fmtDate(valueOf(record, "payPeriodEnd"))}</span>
        ${stateLabel}
      </div>
      <div>
        <strong>${fmtMoney(valueOf(record, "netPay"))}</strong>
        <span>brutto ${fmtMoney(valueOf(record, "grossPay"))} · OT ${fmtNumber(valueOf(record, "overtimeHours"))} h</span>
      </div>`;
    host.append(row);
  }
}

function renderDataSummary(records) {
  el("recordCount").textContent = `${records.length} palkkalaskelmaa paikallisesti`;
  const years = availableYears(records);
  el("recordYears").textContent = years.length ? `Vuodet ${Math.min(...years)}–${Math.max(...years)}` : "Ei vielä historiaa";
}

async function renderLearnedProfileSummary() {
  const profiles = await getLearnedProfiles();
  const observations = profiles.reduce((sum, profile) => sum + Math.max(profile.observations || 0, profile.confirmations || 0), 0);
  const mappedFields = profiles.reduce((sum, profile) => sum + sanitizeMappings(profile.mappings).length, 0);
  if (el("learnedProfileCount")) {
    el("learnedProfileCount").textContent = profiles.length
      ? `${profiles.length} rakennetta · ${observations} havaintoa${mappedFields ? ` · ${mappedFields} opittua kenttää` : ""}`
      : "Ei vielä tunnistettuja rakenteita";
  }
}

function renderConflict(record, conflict) {
  currentPendingRecord = record;
  currentConflict = conflict;
  el("resultSection").classList.add("hidden");
  el("reviewSection").classList.add("hidden");
  el("unknownSection").classList.add("hidden");
  el("conflictSection").classList.remove("hidden");

  const host = el("conflictSummary");
  host.innerHTML = "";

  const identityRows = [
    ["Maksupäivä", fmtFieldValue("payDate", record.values?.payDate)],
    ["Palkkakausi", `${fmtFieldValue("payPeriodStart", record.values?.payPeriodStart)} – ${fmtFieldValue("payPeriodEnd", record.values?.payPeriodEnd)}`]
  ];
  for (const [label, value] of identityRows) {
    const row = document.createElement("div");
    row.className = "summary-row";
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    host.append(row);
  }

  for (const difference of (conflict.differences || []).slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "summary-row";
    const label = fieldLabels[difference.key] || difference.key;
    row.innerHTML = `<span>${label}</span><strong>${fmtFieldValue(difference.key, difference.before)} → ${fmtFieldValue(difference.key, difference.after)}</strong>`;
    host.append(row);
  }

  el("status").textContent = "Samalle palkka-ajalle löytyi eri luvut. Mitään ei yhdistetty automaattisesti.";
}

async function conflictForRecord(record, ignoreRecordId = null) {
  const records = await getAllRecords();
  return findRecordConflict(records, record, { ignoreRecordId });
}

async function processPdf(file) {
  el("status").textContent = "Luetaan PDF:ää…";
  el("resultSection").classList.add("hidden");
  el("reviewSection").classList.add("hidden");
  el("unknownSection").classList.add("hidden");
  currentRecord = null;
  currentLearnedProfile = null;
  currentReviewWasManualConfirmation = false;
  currentPendingRecord = null;
  currentConflict = null;
  currentPendingWasAutoParsed = false;
  el("conflictSection")?.classList.add("hidden");

  currentRawText = await extractPdfText(file);
  currentParsed = parsePayslip(currentRawText);
  currentLearnedProfile = await findLearnedProfile(currentParsed.structureSignals);
  const learnedResult = await applyProfileMappings(currentParsed, currentRawText, currentLearnedProfile);
  currentParsed = learnedResult.parsed;
  currentFingerprint = await sha256(safeFingerprintPayload(currentParsed));
  el("rawText").textContent = currentRawText;

  if (currentParsed.documentType !== "payslip") {
    if (currentLearnedProfile?.trusted) {
      currentParsed.documentType = "payslip";
      currentParsed.sourceProfile = `learned-local:${currentLearnedProfile.id}`;
      currentReviewWasManualConfirmation = true;
      renderReview(currentParsed, problemKeys(currentParsed), true);
      el("reviewTitle").textContent = "Tunnistan rakenteen – tarkista puuttuvat tiedot";
      el("status").textContent = "Tämä rakenne on vahvistettu aiemmin palkkalaskelmaksi tällä laitteella.";
      return;
    }
    renderUnknown();
    return;
  }

  if (canAutoAccept(currentParsed)) {
    const record = makeRecordFromParsed(currentParsed, currentFingerprint);
    const conflict = await conflictForRecord(record);
    if (conflict) {
      currentPendingWasAutoParsed = true;
      renderConflict(record, conflict);
      return;
    }

    const result = await upsertRecord(record);
    await rememberCurrentStructure({ autoParsed: true });
    renderSuccess(result.record, result.mergedDuplicate);
    await renderAll();
    el("status").textContent = result.mergedDuplicate
      ? "Sama palkka löytyi historiasta. Tiedot yhdistettiin ilman tuplaa."
      : "Palkkalaskelma tunnistettiin varmasti ja tallennettiin automaattisesti.";
    return;
  }

  renderReview(currentParsed, problemKeys(currentParsed));
  el("status").textContent = "Palkkalaskelma tunnistettiin, mutta yksi tai useampi ydinkohta tarvitsee tarkistuksen.";
}

el("pdfInput").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await processPdf(file);
  } catch (err) {
    console.error(err);
    el("status").textContent = `PDF:n luku epäonnistui: ${err.message}`;
  } finally {
    event.target.value = "";
  }
});

el("saveButton").addEventListener("click", async () => {
  if (!currentParsed) return;
  const editedValues = collectEditedValues();
  const base = currentRecord || makeRecordFromParsed(currentParsed, currentFingerprint);
  const record = refreshRecordNotices(applyUserCorrections(base, editedValues));

  const missing = requiredFields.filter(key => record.values[key] == null || record.values[key] === "");
  if (missing.length) {
    el("status").textContent = "Täytä vielä maksupäivä, brutto, netto ja YTD ennen tallennusta.";
    return;
  }

  const blocking = (record.notices || []).filter(notice => notice.level === "blocking");
  if (blocking.length) {
    el("status").textContent = blocking[0].message;
    return;
  }

  const conflict = await conflictForRecord(record, currentRecord?.id || null);
  if (conflict) {
    currentPendingWasAutoParsed = false;
    renderConflict(record, conflict);
    return;
  }

  const result = await upsertRecord(record);
  const confirmed = currentReviewWasManualConfirmation || Object.keys(record.corrections || {}).length > 0;
  const mappingUpdates = confirmed
    ? await learnMappingsFromCorrections(currentRawText, record.corrections)
    : [];
  const learned = await rememberCurrentStructure({ confirmed, autoParsed: false, mappingUpdates });
  renderSuccess(result.record, result.mergedDuplicate);
  await renderAll();
  el("status").textContent = learned
    ? "Korjaus tallennettu. Palkkalaskelman rakennehavainto päivitettiin paikallisesti."
    : "Korjaus tallennettu.";
});

el("replaceConflictButton")?.addEventListener("click", async () => {
  if (!currentPendingRecord || !currentConflict?.existing?.id) return;
  const confirmed = currentReviewWasManualConfirmation || Object.keys(currentPendingRecord.corrections || {}).length > 0;
  const mappingUpdates = confirmed
    ? await learnMappingsFromCorrections(currentRawText, currentPendingRecord.corrections)
    : [];
  const replacement = await replaceRecord(currentConflict.existing.id, currentPendingRecord);
  await rememberCurrentStructure({ confirmed, autoParsed: currentPendingWasAutoParsed, mappingUpdates });
  renderSuccess(replacement, false);
  el("resultBadge").textContent = "Korvattu";
  el("resultTitle").textContent = "Aiempi laskelma korvattu";
  el("resultSubtitle").textContent = "Samalle palkka-ajalle ollut aiempi versio korvattiin tällä laskelmalla.";
  await renderAll();
  el("status").textContent = "Ristiriita ratkaistiin korvaamalla aiempi versio.";
});

el("keepBothConflictButton")?.addEventListener("click", async () => {
  if (!currentPendingRecord) return;
  const confirmed = currentReviewWasManualConfirmation || Object.keys(currentPendingRecord.corrections || {}).length > 0;
  const mappingUpdates = confirmed
    ? await learnMappingsFromCorrections(currentRawText, currentPendingRecord.corrections)
    : [];
  const separate = await saveRecordSeparately(currentPendingRecord);
  await rememberCurrentStructure({ confirmed, autoParsed: currentPendingWasAutoParsed, mappingUpdates });
  renderSuccess(separate, false);
  el("resultBadge").textContent = "Molemmat";
  el("resultTitle").textContent = "Molemmat laskelmat säilytettiin";
  el("resultSubtitle").textContent = "Saman palkka-ajan eri versiot pidetään erillisinä historiassa.";
  await renderAll();
  el("status").textContent = "Ristiriita ratkaistiin säilyttämällä molemmat versiot.";
});

el("cancelConflictButton")?.addEventListener("click", () => {
  currentPendingRecord = null;
  currentConflict = null;
  currentPendingWasAutoParsed = false;
  el("conflictSection")?.classList.add("hidden");
  el("status").textContent = "Tallennus peruttiin. Historiadataa ei muutettu.";
});

el("editParsedButton").addEventListener("click", () => {
  if (!currentParsed || !currentRecord) return;
  renderReview(currentParsed, null);
});

el("showAllButton").addEventListener("click", () => {
  if (!currentParsed) return;
  renderReview(currentParsed, null);
});

el("rawToggle").addEventListener("click", () => el("rawText").classList.toggle("hidden"));
el("chooseAnotherButton").addEventListener("click", () => el("pdfInput").click());
el("manualEntryButton").addEventListener("click", () => {
  if (!currentParsed) currentParsed = makeManualParsed();
  currentParsed.documentType = "payslip";
  currentReviewWasManualConfirmation = true;
  currentRecord = null;
  renderReview(currentParsed, requiredFields, true);
});

for (const button of document.querySelectorAll("[data-view-target]")) {
  button.addEventListener("click", () => setView(button.dataset.viewTarget));
}

for (const id of ["dashboardYear", "historyYear", "analysisYear"]) {
  el(id).addEventListener("change", async event => {
    selectedYear = Number(event.target.value);
    await renderAll();
  });
}

el("exportButton").addEventListener("click", async () => {
  const records = await getAllRecords();
  const learnedProfiles = await getLearnedProfiles();
  const backup = makeBackup(records, { learnedProfiles });
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `palkka-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
  el("backupStatus").textContent = "Varmuuskopio luotu. Säilytä tiedosto paikassa, josta saat sen myös uudella puhelimella.";
});

el("importButton").addEventListener("click", () => el("backupInput").click());
el("backupInput").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const records = parseBackup(payload);
    const learnedProfiles = parseBackupLearnedProfiles(payload);
    const result = await mergeManyRecords(records);
    if (learnedProfiles.length) await mergeLearnedProfiles(learnedProfiles);
    await renderAll();
    const preserved = result.conflictsPreserved
      ? `, ${result.conflictsPreserved} ristiriitaversiota säilytetty erillään`
      : "";
    el("backupStatus").textContent = `Palautus valmis: ${result.added} uutta, ${result.merged} yhdistettyä/jo olemassa olevaa${preserved}${learnedProfiles.length ? `, ${learnedProfiles.length} tunnistettua rakennetta` : ""}.`;
  } catch (err) {
    el("backupStatus").textContent = `Palautus epäonnistui: ${err.message}`;
  } finally {
    event.target.value = "";
  }
});

el("clearLearnedButton")?.addEventListener("click", async () => {
  if (!confirm("Nollataanko tällä laitteella opitut palkkalaskelmarakenteet? Palkkahistoriaa ei poisteta.")) return;
  await setLearnedProfiles([]);
  currentLearnedProfile = null;
  await renderLearnedProfileSummary();
  el("backupStatus").textContent = "Tunnistetut rakenteet nollattu. Palkkahistoria säilyi ennallaan.";
});

el("clearButton").addEventListener("click", async () => {
  if (!confirm("Poistetaanko kaikki tämän laitteen paikallisesti tallentamat palkkatiedot? Tätä ei voi perua ilman varmuuskopiota.")) return;
  await clearAllRecords();
  await setLearnedProfiles([]);
  currentRecord = null;
  currentParsed = null;
  el("resultSection").classList.add("hidden");
  el("reviewSection").classList.add("hidden");
  el("unknownSection").classList.add("hidden");
  await renderAll();
  el("backupStatus").textContent = "Paikallinen palkkahistoria ja tunnistetut rakenteet poistettu.";
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  el("installButton").classList.remove("hidden");
});

el("installButton").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  el("installButton").classList.add("hidden");
});

async function init() {
  try {
    initPlannerBridge();
    initBetaYearProgress();
    await initInsightsUi();
    initScenarioUi();
    const migration = await migrateLegacyLocalStorage();
    if (migration.migrated) el("status").textContent = `Vanha paikallinen historia siirrettiin uuteen tietokantaan (${migration.migrated} laskelmaa).`;
    await renderAll();
  } catch (err) {
    console.error(err);
    el("status").textContent = `Paikallisen tietokannan avaaminen epäonnistui: ${err.message}`;
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
}

init();
