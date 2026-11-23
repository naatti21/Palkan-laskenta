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
  // The original horizontal bars use euros on the x-axis. For horizontal
  // comparison lines, both realized amounts and estimated net use a y-axis.
  const values = months.filter(month => month.complete).flatMap(month => [month.gross, month.net]);
  values.push(...plans.map(plan => plan.annualNet / 12));
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const y = value => (max - value) / (max - min) * 100;
  const plot = element("div", "salary-comparison-plot");
  const bars = element("div", "salary-comparison-bars");
  bars.style.gridTemplateColumns = `repeat(${months.length}, minmax(0, 1fr))`;
  bars.setAttribute("role", "group");
  bars.setAttribute("aria-label", "Maksetut kuukausipalkat euroina");

  const zero = element("div", "salary-comparison-zero");
  zero.style.top = y(0) + "%";
  plot.append(zero);
  for (const tick of min < 0 ? [max, min] : [max, max / 2, 0]) {
    const label = element("span", "salary-comparison-tick", axisNumber.format(tick) + " €");
    label.style.top = y(tick) + "%";
    plot.append(label);
  }

  for (const month of months) {
    const group = element("div", "salary-comparison-month");
    group.setAttribute("role", "img");
    group.setAttribute("aria-label", month.complete
      ? `${month.label}: brutto ${currency.format(month.gross)}, netto ${currency.format(month.net)}`
      : `${month.label}: tarkistettavaa`);
    group.title = group.getAttribute("aria-label");
    group.dataset.month = String(month.month);
    const label = element("span", "salary-comparison-month-label", String(month.month) + (month.complete ? "" : "*"));
    label.setAttribute("aria-hidden", "true");
    group.append(label);
    if (month.complete) {
      for (const [kind, value] of [["gross", month.gross], ["net", month.net]]) {
        const bar = element("span", `chart-bar chart-bar-${kind}`);
        bar.style.top = Math.min(y(value), y(0)) + "%";
        bar.style.height = Math.abs(y(value) - y(0)) + "%";
        group.append(bar);
      }
    }
    bars.append(group);
  }
  plot.append(bars);

  for (const plan of plans) {
    const position = y(plan.annualNet / 12) + "%";
    const lane = ids.indexOf(plan.id);
    const coincident = plans.filter(other => other.annualNet === plan.annualNet);
    const line = element("div", `salary-comparison-line salary-plan-${plan.id}`);
    line.style.top = position;
    if (coincident.length > 1) {
      const index = coincident.indexOf(plan);
      line.style.left = (index / coincident.length * 100) + "%";
      line.style.width = (100 / coincident.length) + "%";
    }
    plot.append(line);
    // The buttons occupy separate horizontal lanes, including at identical levels.
    const mark = element("button", `salary-comparison-marker salary-plan-${plan.id}`);
    mark.type = "button";
    mark.style.top = position;
    mark.style.left = ((lane + 0.5) * 100 / ids.length) + "%";
    mark.setAttribute("aria-label", planDetails(plan));
    mark.setAttribute("aria-controls", detail.id);
    mark.setAttribute("aria-pressed", "false");
    mark.append(element("span", "", plan.id));
    mark.addEventListener("click", () => {
      for (const button of plot.querySelectorAll("button")) {
        button.setAttribute("aria-pressed", String(button === mark));
      }
      detail.textContent = planDetails(plan);
    });
    plot.append(mark);
  }
  host.replaceChildren(plot);
}

export function installSalaryComparison() {
  const actualChart = document.getElementById("monthlyChart");
  const frame = document.getElementById("plannerFrame");
  const card = actualChart.closest("section");
  const controls = element("label", "salary-comparison-switch");
  const toggle = element("input");
  toggle.type = "checkbox";
  toggle.setAttribute("role", "switch");
  let enabled = false;
  try { enabled = localStorage.getItem(preferenceKey) === "on"; } catch { /* optional preference */ }
  toggle.checked = enabled;
  const state = element("span", "salary-comparison-switch-state");
  state.setAttribute("aria-hidden", "true");
  controls.append(toggle, document.createTextNode("Näytä A/B/C"), state);
  card.querySelector(".section-heading").after(controls);

  const stack = element("div", "salary-comparison-stack");
  actualChart.before(stack);
  const comparisonChart = element("div", "salary-comparison-chart");
  comparisonChart.id = "salaryComparisonChart";
  toggle.setAttribute("aria-controls", comparisonChart.id);
  stack.append(actualChart, comparisonChart);

  const detail = element("p", "muted salary-comparison-detail");
  detail.id = "salaryComparisonDetail";
  detail.setAttribute("role", "status");
  stack.after(detail);

  let analysis = null;
  let comparison = null;
  function render() {
    const months = analysis?.months.filter(month => month.payslips > 0) ?? [];
    const hasActual = months.some(month => month.complete);
    const matchesYear = analysis && comparison?.year === analysis.year;
    const plans = matchesYear ? comparison.plans : [];
    const available = hasActual && plans.length > 0;
    const show = enabled && available;

    state.textContent = enabled ? "ON" : "OFF";
    stack.classList.toggle("salary-comparison-available", available);
    actualChart.classList.toggle("salary-comparison-inactive", show);
    comparisonChart.classList.toggle("salary-comparison-inactive", !show);
    detail.classList.toggle("salary-comparison-inactive", !enabled);
    if (show) drawComparison(comparisonChart, detail, months, plans);
    else comparisonChart.replaceChildren();

    if (!enabled) detail.textContent = "";
    else if (!analysis) detail.textContent = "Haetaan valitun vuoden palkkoja…";
    else if (!months.length) detail.textContent = "Valitulta vuodelta ei ole palkkahistoriaa toteumavertailuun.";
    else if (!hasActual) detail.textContent = "Toteumavertailu vaatii vähintään yhden kuukauden, jonka palkkatiedot ovat kunnossa.";
    else if (comparison && !matchesYear) detail.textContent = `Analyysin vuosi ${analysis.year} ja Laskurin suunnitteluvuosi ${comparison.year} eroavat. Valitse sama vuosi.`;
    else if (!available) detail.textContent = "Täytä Laskuriin kelvolliset lähtötiedot, niin vertailutasot näkyvät.";
    else {
      const c = plans.find(plan => plan.id === "C");
      detail.textContent = "Vertailuviivat ovat arvioituja kuukausinettoja (vuosinetto ÷ 12). Valitse tunnus."
        + (c && c.referenceYear !== analysis.year ? ` C:n veroviite: ${c.referenceYear}.` : "")
        + (months.some(month => !month.complete) ? " * Kuukauden palkkatiedot pitää tarkistaa." : "");
    }
  }
  toggle.addEventListener("change", () => {
    enabled = toggle.checked;
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
    comparison = Number.isInteger(next?.year) ? { year: next.year, plans } : null;
    render();
  });
  requestComparison();
  render();
  return next => {
    analysis = next;
    render();
  };
}
