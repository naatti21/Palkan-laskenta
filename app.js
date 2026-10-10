import { extractPdfText } from "./pdf-reader.js";
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
  "grossPay", "netPay", "ytdTaxableIncome", "taxCardAccumulatedIncome",
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
      hint.textContent = meta.source ? `Lähde: ${meta.source}` : "Ei tunnistettu";
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
  for (const id of ["dashboardYear", "historyYear"]) {
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

async function renderAll() {
  const records = await getAllRecords();
  syncYearSelectors(records);
  renderDashboard(records);
  renderHistory(records);
  renderDataSummary(records);
  await renderLearnedProfileSummary();
}

function renderDashboard(records) {
  const yearRecords = records.filter(r => r.taxYear === selectedYear);
  const latest = sortByPayDate(yearRecords).at(-1);
  const dash = el("dashboard");
  dash.innerHTML = "";
  const overall = el("overallLight");

  if (!latest) {
    overall.className = "light neutral";
    overall.textContent = "–";
    el("dashboardNote").textContent = `Vuodelta ${selectedYear} ei ole vielä palkkalaskelmia.`;
    return;
  }

  const status = taxStatus(latest);
  overall.className = `light ${status.light}`;
  overall.textContent = status.light === "neutral" ? "–" : "●";

  const remaining = valueOf(latest, "taxLimit") != null && valueOf(latest, "taxCardAccumulatedIncome") != null
    ? valueOf(latest, "taxLimit") - valueOf(latest, "taxCardAccumulatedIncome")
    : null;
  const metrics = [
    ["Viimeisin maksupäivä", fmtDate(valueOf(latest, "payDate"))],
    ["Brutto", fmtMoney(valueOf(latest, "grossPay"))],
    ["Netto", fmtMoney(valueOf(latest, "netPay"))],
    ["Veronalainen YTD", fmtMoney(valueOf(latest, "ytdTaxableIncome"))],
    ["Verokortin kertymä", fmtMoney(valueOf(latest, "taxCardAccumulatedIncome"))],
    ["Tuloraja", fmtMoney(valueOf(latest, "taxLimit"))],
    ["Tulorajaa jäljellä", fmtMoney(remaining)],
    ["OT viime jaksolla", `${fmtNumber(valueOf(latest, "overtimeHours"))} h`]
  ];
  for (const [label, value] of metrics) {
    const box = document.createElement("div");
    box.className = "metric";
    box.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    dash.append(box);
  }

  const state = paymentState(latest);
  const stateText = state === "confirmed_future" ? " Viimeisin laskelma on vahvistettu tuleva palkka." : "";
  el("dashboardNote").textContent = `${status.text}. Tulorajaa verrataan vain verokortin omaan kertymään.${stateText}`;
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

async function conflictForRecord(record) {
  const records = await getAllRecords();
  return findRecordConflict(records, record);
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

  const conflict = await conflictForRecord(record);
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

for (const id of ["dashboardYear", "historyYear"]) {
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
    el("backupStatus").textContent = `Palautus valmis: ${result.added} uutta, ${result.merged} yhdistettyä/jo olemassa olevaa${learnedProfiles.length ? `, ${learnedProfiles.length} tunnistettua rakennetta` : ""}.`;
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
