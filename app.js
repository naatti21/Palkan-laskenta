import { extractPdfText } from "./pdf-reader.js";
import { parsePayslip, plainRecord } from "./parser.js";

const STORAGE_KEY = "palkka-pwa-proto:v1";
let currentParsed = null;
let currentRawText = "";
let deferredInstallPrompt = null;

const fieldLabels = {
  payPeriodStart: "Palkkakausi alkaa",
  payPeriodEnd: "Palkkakausi päättyy",
  payDate: "Maksupäivä",
  grossPay: "Brutto / ennakonpid. al. tulo",
  netPay: "Netto / maksetaan",
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
  overtimeCompensation: "OT-korotukset yhteensä (€)",
  sundayHours: "Sunnuntaityö (h)",
  weeklyRestHours: "Viikkovapaa (h)",
  worktimeBankUseHours: "Työaikapankista käyttö (h)",
  worktimeBankAddHours: "Työaikapankin lisäys (h)"
};

const moneyFields = new Set(["grossPay", "netPay", "ytdTaxableIncome", "taxCardAccumulatedIncome", "withholdingPeriod", "withholdingYtd", "taxLimit", "kta", "pp", "overtimeCompensation"]);
const percentFields = new Set(["taxRate", "additionalRate"]);
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

function renderReview(parsed) {
  el("reviewSection").classList.remove("hidden");
  el("confidenceBadge").textContent = `${Math.round(parsed.overallConfidence * 100)} % ydinkentistä`;
  const grid = el("reviewGrid");
  grid.innerHTML = "";

  for (const [key, meta] of Object.entries(parsed.fields)) {
    if (!(key in fieldLabels)) continue;
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
    const hint = document.createElement("small");
    hint.textContent = meta.source ? `${Math.round(meta.confidence * 100)} % · ${meta.source}` : "Ei tunnistettu";
    wrapper.append(title, input, hint);
    grid.append(wrapper);
  }

  if (parsed.warnings.length) {
    const warning = document.createElement("div");
    warning.className = "inline-warning";
    warning.innerHTML = `<strong>Tarkista:</strong> ${parsed.warnings.join(" ")}`;
    grid.prepend(warning);
  }
}

function collectEditedRecord() {
  const record = plainRecord(currentParsed);
  for (const input of document.querySelectorAll("#reviewGrid input[data-key]")) {
    const key = input.dataset.key;
    if (dateFields.has(key)) record[key] = input.value || null;
    else record[key] = input.value.trim() === "" ? null : Number(input.value.replace(/\s/g, "").replace(",", "."));
  }
  record.savedAt = new Date().toISOString();
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
  overall.textContent = status.light === "green" ? "●" : status.light === "yellow" ? "●" : status.light === "red" ? "●" : "–";

  const remaining = latest.taxLimit != null && latest.taxCardAccumulatedIncome != null ? latest.taxLimit - latest.taxCardAccumulatedIncome : null;
  const metrics = [
    ["Viimeisin maksupäivä", fmtDate(latest.payDate)],
    ["Viimeisin brutto", fmtMoney(latest.grossPay)],
    ["Viimeisin netto", fmtMoney(latest.netPay)],
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
  el("dashboardNote").textContent = status.text + ". Tulorajan vertailu käyttää verokortin omaa kertymää, ei koko vuoden YTD-tuloa.";
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
  try {
    currentRawText = await extractPdfText(file);
    currentParsed = parsePayslip(currentRawText);
    renderReview(currentParsed);
    el("rawText").textContent = currentRawText;
    el("status").textContent = currentParsed.documentType === "payslip"
      ? "Palkkalaskelma tunnistettu. Tarkista luvut ennen tallennusta."
      : "Dokumenttia ei tunnistettu riittävän varmasti.";
  } catch (err) {
    console.error(err);
    el("status").textContent = `PDF:n luku epäonnistui: ${err.message}`;
  }
});

el("saveButton").addEventListener("click", () => {
  if (!currentParsed) return;
  const record = collectEditedRecord();
  const history = loadHistory();
  const duplicate = history.findIndex(r => r.payDate === record.payDate && r.grossPay === record.grossPay && r.netPay === record.netPay);
  if (duplicate >= 0) history[duplicate] = record; else history.push(record);
  saveHistory(history);
  el("status").textContent = "Tallennettu paikallisesti laitteelle.";
  renderDashboard();
});

el("rawToggle").addEventListener("click", () => el("rawText").classList.toggle("hidden"));
el("clearButton").addEventListener("click", () => {
  if (confirm("Poistetaanko kaikki tämän prototyypin paikallisesti tallentamat palkkatiedot?")) {
    localStorage.removeItem(STORAGE_KEY);
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
