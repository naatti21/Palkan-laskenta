import { extractPdfText } from "./pdf-reader.js";
import { parsePayslip, validate } from "./parser.js";
import {
  VALUE_KEYS,
  applyUserCorrections,
  makeBackup,
  makeRecordFromParsed,
  parseBackup,
  paymentState
} from "./model.js";
import {
  clearAllRecords,
  getAllRecords,
  mergeManyRecords,
  migrateLegacyLocalStorage,
  upsertRecord
} from "./storage.js";

let currentParsed = null;
let currentRawText = "";
let currentFingerprint = "";
let currentRecord = null;
let deferredInstallPrompt = null;
let selectedYear = null;

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
  el("reviewSection").classList.add("hidden");
  el("unknownSection").classList.add("hidden");
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
  el("reviewSection").classList.remove("hidden");

  const isPartial = Array.isArray(keys) && keys.length > 0;
  el("reviewEyebrow").textContent = manual ? "KÄSIN TÄYTTÖ" : isPartial ? "TARVITSEN TARKISTUKSEN" : "MUOKKAUS";
  el("reviewTitle").textContent = manual ? "Täytä palkkalaskelman ydintiedot" : isPartial ? "Tarkista vain nämä kohdat" : "Muokkaa tietoja";
  el("reviewIntro").textContent = manual
    ? "Täytä vähintään maksupäivä, brutto, netto ja vuoden veronalainen kertymä. Muita kenttiä voi lisätä tarvittaessa."
    : isPartial
      ? "Palkkalaskelma tunnistettiin, mutta nämä kohdat tarvitsevat varmistuksen. Muita tietoja ei tarvitse käydä läpi."
      : "Muuta vain sitä, mikä on väärin. Käyttäjän korjaus säilytetään parserin alkuperäisen arvon rinnalla.";
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

async function processPdf(file) {
  el("status").textContent = "Luetaan PDF:ää…";
  el("resultSection").classList.add("hidden");
  el("reviewSection").classList.add("hidden");
  el("unknownSection").classList.add("hidden");
  currentRecord = null;

  currentRawText = await extractPdfText(file);
  currentParsed = parsePayslip(currentRawText);
  currentFingerprint = await sha256(safeFingerprintPayload(currentParsed));
  el("rawText").textContent = currentRawText;

  if (currentParsed.documentType !== "payslip") {
    renderUnknown();
    return;
  }

  if (canAutoAccept(currentParsed)) {
    const record = makeRecordFromParsed(currentParsed, currentFingerprint);
    const result = await upsertRecord(record);
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

  const result = await upsertRecord(record);
  renderSuccess(result.record, result.mergedDuplicate);
  await renderAll();
  el("status").textContent = "Korjaus tallennettu.";
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
  currentParsed = makeManualParsed();
  currentFingerprint = "";
  currentRecord = null;
  currentRawText = "";
  el("rawText").textContent = "";
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
  const backup = makeBackup(records);
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
    const result = await mergeManyRecords(records);
    await renderAll();
    el("backupStatus").textContent = `Palautus valmis: ${result.added} uutta, ${result.merged} yhdistettyä/jo olemassa olevaa.`;
  } catch (err) {
    el("backupStatus").textContent = `Palautus epäonnistui: ${err.message}`;
  } finally {
    event.target.value = "";
  }
});

el("clearButton").addEventListener("click", async () => {
  if (!confirm("Poistetaanko kaikki tämän laitteen paikallisesti tallentamat palkkatiedot? Tätä ei voi perua ilman varmuuskopiota.")) return;
  await clearAllRecords();
  currentRecord = null;
  currentParsed = null;
  el("resultSection").classList.add("hidden");
  el("reviewSection").classList.add("hidden");
  el("unknownSection").classList.add("hidden");
  await renderAll();
  el("backupStatus").textContent = "Paikallinen palkkahistoria poistettu.";
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
