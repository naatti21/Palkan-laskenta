import { extractPdfText } from "./pdf-reader.js";
import { parsePayslip, plainRecord } from "./parser.js";

const STORAGE_KEY = "palkka-pwa-proto:v1";
let currentParsed = null;
let currentRawText = "";
let deferredInstallPrompt = null;
let showingAllFields = false;

const fieldLabels = {
  payPeriodStart: "Palkkakausi alkaa",
  payPeriodEnd: "Palkkakausi päättyy",
  payDate: "Maksupäivä",
  grossPay: "Brutto",
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

const el = id => document.getElementById(id);
const fmtMoney = n => n == null ? "–" : new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" }).format(n);
const fmtNumber = n => n == null ? "–" : new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 2 }).format(n);
const fmtDate = iso => iso ? new Intl.DateTimeFormat("fi-FI").format(new Date(`${iso}T12:00:00`)) : "–";

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(records) { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }

function upsertRecord(record) {
  const history = loadHistory();
  const duplicate = history.findIndex(r => r.payDate === record.payDate && r.grossPay === record.grossPay && r.netPay === record.netPay);
  if (duplicate >= 0) history[duplicate] = record; else history.push(record);
  saveHistory(history);
}

function parsedRecord(parsed) {
  const record = plainRecord(parsed);
  record.savedAt = new Date().toISOString();
  return record;
}

function problemKeys(parsed) {
  const keys = new Set();
  for (const key of requiredFields) {
    const meta = parsed.fields[key];
    if (!meta || meta.value == null || meta.confidence < .95) keys.add(key);
  }

  for (const [key, meta] of Object.entries(parsed.fields)) {
    if (meta.value != null && meta.confidence > 0 && meta.confidence < .9) keys.add(key);
  }

  for (const warning of parsed.warnings) {
    if (/Nettopalkka/.test(warning)) ["grossPay", "netPay"].forEach(k => keys.add(k));
    if (/Tuloraja löytyi/.test(warning)) ["taxCardAccumulatedIncome", "taxLimit", "ytdTaxableIncome"].forEach(k => keys.add(k));
    if (/Ylityötunteja/.test(warning)) ["overtime100DailyHours", "overtime50WeeklyHours", "overtime100WeeklyHours", "overtimeHours"].forEach(k => keys.add(k));
    if (/Verokortin kertymä/.test(warning)) ["taxCardAccumulatedIncome", "taxLimit"].forEach(k => keys.add(k));
  }

  if (parsed.documentType !== "payslip" && !keys.size) requiredFields.forEach(k => keys.add(k));
  return [...keys];
}

function canAutoAccept(parsed) {
  if (parsed.documentType !== "payslip" || parsed.warnings.length) return false;
  return requiredFields.every(key => {
    const meta = parsed.fields[key];
    return meta?.value != null && meta.confidence >= .95;
  });
}

function fieldDisplay(key, value) {
  if (dateFields.has(key)) return fmtDate(value);
  if (["grossPay", "netPay", "ytdTaxableIncome", "taxCardAccumulatedIncome", "withholdingPeriod", "withholdingYtd", "taxLimit", "kta", "pp", "overtimeCompensation"].includes(key)) return fmtMoney(value);
  if (["taxRate", "additionalRate"].includes(key)) return value == null ? "–" : `${fmtNumber(value)} %`;
  return value == null ? "–" : fmtNumber(value);
}

function detectedCategories(record) {
  const tags = [];
  if ((record.overtimeHours ?? 0) > 0) tags.push(`✓ Ylityö ${fmtNumber(record.overtimeHours)} h`);
  if ((record.sundayHours ?? 0) > 0) tags.push(`✓ Sunnuntai ${fmtNumber(record.sundayHours)} h`);
  if ((record.weeklyRestHours ?? 0) > 0) tags.push(`✓ Viikkovapaa ${fmtNumber(record.weeklyRestHours)} h`);
  if ((record.worktimeBankUseHours ?? 0) !== 0 || (record.worktimeBankAddHours ?? 0) !== 0) tags.push("✓ Työaikapankki");
  if (!tags.length) tags.push("✓ Peruspalkka");
  return tags;
}

function renderSuccess(record) {
  el("reviewSection").classList.add("hidden");
  el("resultSection").classList.remove("hidden");
  el("resultBadge").textContent = "Tallennettu";

  const summary = el("resultSummary");
  summary.innerHTML = "";
  const rows = [
    ["Maksupäivä", fmtDate(record.payDate)],
    ["Brutto", fmtMoney(record.grossPay)],
    ["Netto", fmtMoney(record.netPay)],
    ["YTD", fmtMoney(record.ytdTaxableIncome)]
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
}

function renderReview(parsed, keys = null) {
  el("resultSection").classList.add("hidden");
  el("reviewSection").classList.remove("hidden");
  el("confidenceBadge").textContent = `${Math.round(parsed.overallConfidence * 100)} % ydinkentistä`;

  const isPartial = Array.isArray(keys) && keys.length > 0;
  el("reviewEyebrow").textContent = isPartial ? "TARVITSEN TARKISTUKSEN" : "MUOKKAUS";
  el("reviewTitle").textContent = isPartial ? "Tarkista vain nämä kohdat" : "Muokkaa tietoja";
  el("reviewIntro").textContent = isPartial
    ? "Muu tieto näyttää riittävän varmalta. Korjaa vain alla näkyvät kohdat."
    : "Kaikki tunnistetut kentät ovat muokattavissa.";
  el("showAllButton").classList.toggle("hidden", !isPartial);

  const visible = isPartial ? new Set(keys) : new Set(Object.keys(fieldLabels));
  const grid = el("reviewGrid");
  grid.innerHTML = "";

  if (parsed.warnings.length) {
    const warning = document.createElement("div");
    warning.className = "inline-warning";
    warning.innerHTML = `<strong>Tarkista:</strong> ${parsed.warnings.join(" ")}`;
    grid.append(warning);
  }

  for (const [key, meta] of Object.entries(parsed.fields)) {
    if (!(key in fieldLabels) || !visible.has(key)) continue;
    const wrapper = document.createElement("label");
    wrapper.className = `review-field ${meta.confidence && meta.confidence < .9 ? "uncertain" : ""}`;
    const title = document.createElement("span");
    title.className = "field-label";
    title.textContent = fieldLabels[key];
    const input = document.createElement("input");
    input.dataset.key = key;
    input.type = dateFields.has(key) ? "date" : "text";
    input.value = meta.value ?? "";
    if (!dateFields.has(key)) input.inputMode = "decimal";
    wrapper.append(title, input);
    if (meta.value == null || meta.confidence < .9) {
      const hint = document.createElement("small");
      hint.textContent = meta.source ? `${Math.round(meta.confidence * 100)} % · ${meta.source}` : "Ei tunnistettu";
      wrapper.append(hint);
    }
    grid.append(wrapper);
  }
}

function collectEditedRecord() {
  const record = parsedRecord(currentParsed);
  for (const input of document.querySelectorAll("#reviewGrid input[data-key]")) {
    const key = input.dataset.key;
    if (dateFields.has(key)) record[key] = input.value || null;
    else record[key] = input.value.trim() === "" ? null : Number(input.value.replace(/\s/g, "").replace(",", "."));
  }
  return record;
}

function taxStatus(record) {
  if (record.taxLimit == null) return { light: "neutral", text: "Tulorajaa ei löytynyt" };
  if (record.taxCardAccumulatedIncome == null) return { light: "neutral", text: "Verokortin kertymä puuttuu" };
  const ratio = record.taxCardAccumulatedIncome / record.taxLimit;
  if (ratio > 1) return { light: "red", text: "Tuloraja ylitetty" };
  if (ratio >= .9) return { light: "yellow", text: "Tuloraja lähestyy" };
  return { light: "green", text: "Tuloraja kunnossa" };
}

function renderDashboard() {
  const history = loadHistory().sort((a, b) => (a.payDate || "").localeCompare(b.payDate || ""));
  const latest = history.at(-1);
  const dash = el("dashboard");
  dash.innerHTML = "";
  const overall = el("overallLight");

  if (!latest) {
    overall.className = "light neutral";
    overall.textContent = "–";
    el("dashboardNote").textContent = "Tallenna vähintään yksi palkkalaskelma.";
    renderHistory(history);
    return;
  }

  const status = taxStatus(latest);
  overall.className = `light ${status.light}`;
  overall.textContent = status.light === "neutral" ? "–" : "●";

  const remaining = latest.taxLimit != null && latest.taxCardAccumulatedIncome != null ? latest.taxLimit - latest.taxCardAccumulatedIncome : null;
  const metrics = [
    ["Viimeisin maksupäivä", fmtDate(latest.payDate)],
    ["Brutto", fmtMoney(latest.grossPay)],
    ["Netto", fmtMoney(latest.netPay)],
    ["Veronalainen YTD", fmtMoney(latest.ytdTaxableIncome)],
    ["Verokortin kertymä", fmtMoney(latest.taxCardAccumulatedIncome)],
    ["Tuloraja", fmtMoney(latest.taxLimit)],
    ["Tulorajaa jäljellä", fmtMoney(remaining)],
    ["OT viime jaksolla", `${fmtNumber(latest.overtimeHours)} h`]
  ];
  for (const [label, value] of metrics) {
    const box = document.createElement("div");
    box.className = "metric";
    box.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    dash.append(box);
  }
  el("dashboardNote").textContent = `${status.text}. Tulorajaa verrataan verokortin omaan kertymään.`;
  renderHistory(history);
}

function renderHistory(history = loadHistory()) {
  const host = el("history");
  if (!history.length) { host.innerHTML = '<p class="muted">Ei tallennettuja laskelmia.</p>'; return; }
  host.innerHTML = "";
  for (const r of [...history].sort((a,b)=>(b.payDate||"").localeCompare(a.payDate||""))) {
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `<div><strong>${fmtDate(r.payDate)}</strong><span>${fmtDate(r.payPeriodStart)}–${fmtDate(r.payPeriodEnd)}</span></div><div><strong>${fmtMoney(r.netPay)}</strong><span>brutto ${fmtMoney(r.grossPay)} · OT ${fmtNumber(r.overtimeHours)} h</span></div>`;
    host.append(row);
  }
}

el("pdfInput").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  el("status").textContent = "Luetaan PDF:ää…";
  el("resultSection").classList.add("hidden");
  el("reviewSection").classList.add("hidden");
  try {
    currentRawText = await extractPdfText(file);
    currentParsed = parsePayslip(currentRawText);
    el("rawText").textContent = currentRawText;
    showingAllFields = false;

    if (canAutoAccept(currentParsed)) {
      const record = parsedRecord(currentParsed);
      upsertRecord(record);
      renderSuccess(record);
      renderDashboard();
      el("status").textContent = "Tunnistus onnistui ja palkkalaskelma tallennettiin automaattisesti.";
    } else {
      const keys = problemKeys(currentParsed);
      renderReview(currentParsed, keys);
      el("status").textContent = currentParsed.documentType === "payslip"
        ? "Tulkinnassa on epävarma kohta. Tarkista vain pyydetyt tiedot."
        : "Dokumenttia ei tunnistettu riittävän varmasti. Täydennä puuttuvat ydintiedot.";
    }
  } catch (err) {
    console.error(err);
    el("status").textContent = `PDF:n luku epäonnistui: ${err.message}`;
  }
});

el("saveButton").addEventListener("click", () => {
  if (!currentParsed) return;
  const record = collectEditedRecord();
  upsertRecord(record);
  renderSuccess(record);
  renderDashboard();
  el("status").textContent = "Korjaus tallennettu.";
});

el("editParsedButton").addEventListener("click", () => {
  if (!currentParsed) return;
  showingAllFields = true;
  renderReview(currentParsed, null);
});

el("showAllButton").addEventListener("click", () => {
  if (!currentParsed) return;
  showingAllFields = true;
  renderReview(currentParsed, null);
});

el("rawToggle").addEventListener("click", () => el("rawText").classList.toggle("hidden"));
el("clearButton").addEventListener("click", () => {
  if (confirm("Poistetaanko kaikki tämän prototyypin paikallisesti tallentamat palkkatiedot?")) {
    localStorage.removeItem(STORAGE_KEY);
    el("resultSection").classList.add("hidden");
    el("reviewSection").classList.add("hidden");
    renderDashboard();
  }
});

el("exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(loadHistory(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "palkka-pwa-export.json";
  a.click();
  URL.revokeObjectURL(a.href);
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

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
renderDashboard();
