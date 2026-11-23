const preferenceKey = "palkka.beta.showSalaryComparison";
const currency = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" });
const axisNumber = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 2 });
const ids = ["A", "B", "C"];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function planDetails(plan) {
  return [
    `${plan.id} · Nettoarvio ${currency.format(plan.annualNet / 12)} / kk`,
    `${currency.format(plan.annualNet)} / vuosi`,
    Number.isInteger(plan.weekends) && `${plan.weekends} työviikonloppua`,
    plan.id === "C" && `Veroviite ${plan.referenceYear}`
  ].filter(Boolean).join(" · ");
}

function drawComparison(host, detail, months, plans) {
  const groups = new Map();
  for (const plan of plans) {
    const value = plan.annualNet / 12;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(plan);
  }
  const values = months.filter(month => month.complete).map(month => month.net);
  values.push(...groups.keys());
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const y = value => (max - value) / (max - min) * 100;
  const keys = element("div", "salary-comparison-keys");
  keys.style.setProperty("--plan-count", groups.size);
  const plot = element("div", "salary-comparison-plot");
  const bars = element("div", "salary-comparison-bars");
  bars.style.gridTemplateColumns = `repeat(${months.length}, minmax(0, 1fr))`;
  bars.setAttribute("role", "group");
  bars.setAttribute("aria-label", "Toteutuneet kuukausinetot");

  function select(button, texts) {
    for (const item of host.querySelectorAll("button[aria-pressed]")) {
      item.setAttribute("aria-pressed", String(item === button));
    }
    detail.replaceChildren(...texts.map(text => element("div", "", text)));
  }

  const zero = element("div", "salary-comparison-zero");
  zero.style.top = y(0) + "%";
  plot.append(zero);
  for (const tick of min < 0 ? [max, 0, min] : [max, max / 2, 0]) {
    const label = element("span", "salary-comparison-tick", axisNumber.format(tick) + " €");
    label.style.top = y(tick) + "%";
    plot.append(label);
  }

  for (const month of months) {
    const label = String(month.month) + (month.complete ? "" : "*");
    const group = element(month.complete ? "button" : "div", "salary-comparison-month");
    group.dataset.month = String(month.month);
    group.append(element("span", "salary-comparison-month-label", label));
    if (month.complete) {
      const name = `${month.label} · Toteutunut netto ${currency.format(month.net)}`;
      group.type = "button";
      group.setAttribute("aria-label", name);
      group.setAttribute("aria-pressed", "false");
      group.addEventListener("click", () => select(group, [name]));
      const bar = element("span", "chart-bar chart-bar-net");
      bar.style.top = Math.min(y(month.net), y(0)) + "%";
      bar.style.height = Math.abs(y(month.net) - y(0)) + "%";
      group.append(bar);
    } else {
      group.setAttribute("role", "img");
      group.setAttribute("aria-label", `${month.label}: tarkistettavaa`);
    }
    bars.append(group);
  }
  plot.append(bars);

  for (const [value, members] of groups) {
    const label = members.map(plan => plan.id).join("+");
    const style = members.length === 1 ? `salary-plan-${label}` : "salary-plan-shared";
    const line = element("div", `salary-comparison-line ${style}`);
    line.dataset.plans = label;
    line.style.top = y(value) + "%";
    plot.append(line);

    const button = element("button", `salary-comparison-marker ${style}`);
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-controls", detail.id);
    button.append(element("strong", "", label), element("span", "", currency.format(value)));
    button.addEventListener("click", () => select(button, members.map(planDetails)));
    keys.append(button);
  }
  const legend = element("p", "salary-comparison-legend", "Toteutunut netto");
  const estimate = element("p", "salary-comparison-caption", "Laskurin kuukausinetot · vuosinetto ÷ 12");
  host.replaceChildren(legend, ...(plans.length ? [estimate, keys] : []), plot);
}

const missingC = {
  "no-target": "C-tavoitetta ei ole asetettu.",
  "invalid-target": "C-tavoite on virheellinen.",
  "no-result": "C-tavoitteelle ei löytynyt tulosta veroviitteen alueella."
};

export function installSalaryComparison() {
  const actualChart = document.getElementById("monthlyChart");
  const frame = document.getElementById("plannerFrame");
  const card = actualChart.closest("section");
  card.classList.add("salary-comparison-card");
  const actualLegend = card.querySelector(".chart-legend");
  const toggle = element("button", "salary-comparison-switch", "Näytä A/B/C");
  toggle.type = "button";
  toggle.setAttribute("role", "switch");
  const track = element("span", "salary-comparison-switch-track");
  track.setAttribute("aria-hidden", "true");
  toggle.append(track);
  let enabled = false;
  try { enabled = localStorage.getItem(preferenceKey) === "on"; } catch { /* optional preference */ }
  card.querySelector(".section-heading").after(toggle);

  const comparisonChart = element("div", "salary-comparison-chart");
  comparisonChart.id = "salaryComparisonChart";
  toggle.setAttribute("aria-controls", comparisonChart.id);
  actualChart.after(comparisonChart);

  const detail = element("div", "muted salary-comparison-detail");
  detail.id = "salaryComparisonDetail";
  detail.setAttribute("role", "status");
  const cNotice = element("p", "muted salary-comparison-notice");
  const plannerLink = element("button", "chip salary-comparison-link", "Avaa Laskuri");
  plannerLink.type = "button";
  plannerLink.addEventListener("click", () => {
    document.querySelector('[data-view-target="planning"]').click();
    const heading = document.getElementById("plannerHeading");
    heading.tabIndex = -1;
    heading.focus();
  });
  comparisonChart.after(detail, cNotice, plannerLink);

  let analysis = null;
  let comparison = null;
  function render() {
    const months = analysis?.months.filter(month => month.payslips > 0) ?? [];
    const hasActual = months.some(month => month.complete);
    const matchesYear = analysis && comparison?.year === analysis.year;
    const plans = matchesYear ? comparison.plans : [];
    const available = hasActual && plans.length > 0;
    const show = enabled && hasActual;

    toggle.setAttribute("aria-checked", String(enabled));
    actualChart.hidden = enabled;
    actualLegend.hidden = enabled;
    comparisonChart.hidden = !show;
    detail.hidden = !enabled;
    cNotice.hidden = true;
    plannerLink.hidden = true;
    if (show) drawComparison(comparisonChart, detail, months, plans);
    else comparisonChart.replaceChildren();

    if (!enabled) detail.textContent = "";
    else if (!analysis) detail.textContent = "Haetaan valitun vuoden palkkoja…";
    else if (!months.length) detail.textContent = "Valitulta vuodelta ei ole palkkahistoriaa toteumavertailuun.";
    else if (!hasActual) detail.textContent = "Toteumavertailu vaatii vähintään yhden kuukauden, jonka palkkatiedot ovat kunnossa.";
    else if (comparison && !matchesYear) {
      detail.textContent = `Analyysin vuosi ${analysis.year} ja Laskurin suunnitteluvuosi ${comparison.year} eroavat. Valitse sama vuosi.`;
      plannerLink.hidden = false;
    } else if (!available) {
      detail.textContent = "Täytä Laskuriin kelvolliset lähtötiedot, niin vertailutasot näkyvät.";
      plannerLink.hidden = false;
    } else {
      detail.textContent = "Valitse kuukausi tai A/B/C-taso nähdäksesi tarkan summan.";
      const c = plans.find(plan => plan.id === "C");
      const notes = [];
      if (!c) {
        notes.push(missingC[comparison.cUnavailable] ?? missingC["no-result"]);
        plannerLink.hidden = false;
      } else if (c.referenceYear !== analysis.year) notes.push(`C:n veroviite: ${c.referenceYear}.`);
      if (months.some(month => !month.complete)) notes.push("* Kuukauden palkkatiedot pitää tarkistaa.");
      cNotice.textContent = notes.join(" ");
      cNotice.hidden = notes.length === 0;
    }
  }
  toggle.addEventListener("click", () => {
    enabled = !enabled;
    try { localStorage.setItem(preferenceKey, enabled ? "on" : "off"); } catch { /* optional preference */ }
    render();
  });
  const requestComparison = () => {
    frame.contentWindow?.postMessage({ type: "palkka:beta:salary-comparison-request" }, location.origin);
  };
  frame.addEventListener("load", () => {
    comparison = null;
    render();
    requestComparison();
  });
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow ||
        event.data?.type !== "palkka:beta:salary-comparison") return;
    const next = event.data.comparison;
    const plans = Array.isArray(next?.plans)
      ? next.plans.filter(plan => ids.includes(plan?.id) && Number.isFinite(plan.annualNet))
      : [];
    comparison = Number.isInteger(next?.year) ? { year: next.year, plans, cUnavailable: next.cUnavailable } : null;
    render();
  });
  requestComparison();
  render();
  return next => {
    analysis = next;
    render();
  };
}
