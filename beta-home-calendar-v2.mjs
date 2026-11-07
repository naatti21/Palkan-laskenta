import { paymentState, projectPayroll } from "./model.js";

const money = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" });
const dateFI = iso => iso ? new Intl.DateTimeFormat("fi-FI").format(new Date(iso + "T12:00:00")) : "–";
const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
const numeric = value => typeof value === "number" && Number.isFinite(value);
function sumKnown(rows, key) {
  if (!rows.length || rows.some(row => !numeric(row.values?.[key]))) return null;
  return rows.reduce((total, row) => total + Math.round(row.values[key] * 100), 0) / 100;
}
function safeDate(row) {
  return /^\d{4}-\d{2}-\d{2}$/.test(row.values?.payDate || "");
}

export function installHomeCalendarV2() {
  // Only the generated Beta imports this module. Main and staging keep their own UI.
  const nav = document.querySelector(".tabs");
  const homeButton = nav.querySelector('[data-view-target="tracking"]');
  const calendarButton = nav.querySelector('[data-view-target="history"]');
  homeButton.lastChild.textContent = "Etusivu";
  calendarButton.lastChild.textContent = "Kalenteri";

  // Detailed analytics remains available, without occupying a fifth primary tab.
  const analysisButton = nav.querySelector('[data-view-target="analysis"]');
  analysisButton.remove();
  analysisButton.className = "beta-analysis-link";
  analysisButton.textContent = "Analyysi";
  document.querySelector(".hero")?.append(analysisButton);
  const analysis = document.querySelector('[data-view="analysis"]');
  const back = node("button", "beta-back-link", "← Etusivulle");
  back.type = "button";
  back.dataset.viewTarget = "tracking";
  analysis.prepend(back);

  const opening = document.getElementById("ledgerOpening");
  const header = opening.querySelector(".section-heading h2");
  header.textContent = "Palkan tilanne";
  const lead = opening.querySelector(".compact-lead");
  lead.replaceChildren();
  const small = node("span", "beta-home-eyebrow", "VIIMEISIN MAKSU");
  const amount = node("strong", "beta-home-amount", "–");
  const caption = node("p", "beta-home-caption", "Ei vielä toteutuneita maksuja");
  const gross = node("div", "beta-home-gross", "");
  const detailsButton = node("button", "beta-home-detail", "Näytä palkkaerittely");
  detailsButton.type = "button";
  detailsButton.hidden = true;
  lead.append(small, amount, caption, gross, detailsButton);

  const total = node("section", "beta-home-year");
  total.setAttribute("aria-live", "polite");
  const label = node("h3", "beta-year-heading", "Vuoden koonti");
  const cells = node("div", "beta-year-cells");
  const netCell = node("div", "beta-year-cell");
  const grossCell = node("div", "beta-year-cell");
  const yearNet = node("strong", "", "–");
  const yearGross = node("strong", "", "–");
  netCell.append(node("span", "", "Vuoden netto"), yearNet);
  grossCell.append(node("span", "", "Vuoden brutto"), yearGross);
  cells.append(netCell, grossCell);
  const caution = node("p", "beta-year-caution", "");
  total.append(label, cells, caution);
  const legacy = document.getElementById("dashboard");
  opening.insertBefore(total, legacy);
  // The original metrics stay in an expandable disclosure for the existing Beta calculator.
  const metricsDetails = node("details", "beta-home-additional");
  metricsDetails.append(node("summary", "", "Veronalainen kertymä ja muita palkkatietoja"));
  legacy.before(metricsDetails);
  metricsDetails.append(legacy);
  opening.querySelector(".compact-gross")?.remove();
  document.getElementById("yearProgressPanel")?.remove();

  const yearSelectors = ["dashboardYear", "historyYear"].map(id => {
    const select = document.getElementById(id);
    if (!select) return null;
    select.hidden = true;
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    const wrap = node("div", "beta-year-stepper");
    const prev = node("button", "", "‹");
    const current = node("span", "", "—");
    const next = node("button", "", "›");
    prev.type = next.type = "button";
    prev.setAttribute("aria-label", "Edellinen vuosi");
    next.setAttribute("aria-label", "Seuraava vuosi");
    wrap.append(prev, current, next);
    select.after(wrap);
    function update() {
      const years = [...select.options].map(o => Number(o.value)).filter(Number.isInteger);
      const at = years.indexOf(Number(select.value));
      current.textContent = select.value || "—";
      prev.disabled = at === -1 || at >= years.length - 1;
      next.disabled = at <= 0;
      // Years arrive newest-first from the existing application selector.
      prev.onclick = () => move(at + 1, years);
      next.onclick = () => move(at - 1, years);
    }
    function move(position, years) {
      if (!years[position]) return;
      select.value = String(years[position]);
      select.dispatchEvent(new Event("change", { bubbles:true }));
    }
    return update;
  }).filter(Boolean);

  let latestDate = null;
  detailsButton.addEventListener("click", () => {
    if (!latestDate) return;
    const historyYear = document.getElementById("historyYear");
    const targetYear = latestDate.slice(0, 4);
    if (historyYear?.value !== targetYear &&
        [...historyYear.options].some(option => option.value === targetYear)) {
      historyYear.value = targetYear;
      historyYear.dispatchEvent(new Event("change", { bubbles: true }));
    }
    calendarButton.click();
    document.getElementById("ledgerCalendar")?.dispatchEvent(
      new CustomEvent("ledger-select-date", { detail: { date: latestDate } })
    );
  });

  document.addEventListener("compact-payments", ({ detail: { records, year, sourceName } }) => {
    const projection = projectPayroll(records);
    const realized = projection.active.filter(row => safeDate(row) && paymentState(row) === "realized");
    const ordered = [...realized].sort((a,b) => a.values.payDate.localeCompare(b.values.payDate));
    latestDate = ordered.at(-1)?.values.payDate || null;
    const latest = latestDate ? ordered.filter(row => row.values.payDate === latestDate) : [];
    const latestNet = sumKnown(latest, "netPay");
    const latestGross = sumKnown(latest, "grossPay");
    amount.textContent = latest.length && latestNet !== null ? money.format(latestNet) : "–";
    caption.textContent = latest.length
      ? "Maksupäivä " + dateFI(latestDate) + " · " +
        (latest.length === 1 ? sourceName(latest[0].incomeSourceId) : latest.length + " erillistä maksua")
      : "Ei vielä toteutuneita maksuja";
    gross.textContent = latest.length
      ? "Brutto " + (latestGross === null ? "tieto puuttuu" : money.format(latestGross))
      : "";
    detailsButton.hidden = !latest.length;
    if (latest.length && latestNet === null) {
      caution.textContent = "Viimeisimmästä maksusta puuttuu nettotieto.";
    }

    const annual = realized.filter(row => row.values.payDate.startsWith(year + "-"));
    const net = sumKnown(annual, "netPay");
    const annualGross = sumKnown(annual, "grossPay");
    label.textContent = "Vuoden " + year + " koonti";
    yearNet.textContent = net === null ? "–" : money.format(net);
    yearGross.textContent = annualGross === null ? "–" : money.format(annualGross);
    const problems = projection.unresolved.filter(row => !row.values?.payDate ||
      row.values.payDate.startsWith(year + "-"));
    caution.textContent = !annual.length ? "Ei toteutuneita maksuja valitulta vuodelta." :
      problems.length ? "Ratkaisemattomat maksut eivät sisälly koontiin. Tarkista ne Kalenteri → Lista -näkymässä." :
      net === null || annualGross === null ? "Osasta maksuja puuttuu summa. Koontia ei arvioida." :
      annual.length + " toteutunutta maksua · summat maksupäivän perusteella.";
    for (const update of yearSelectors) update();
  });

  document.getElementById("ledgerCalendar")?.addEventListener("ledger-render", () => {
    for (const update of yearSelectors) update();
  });
}
