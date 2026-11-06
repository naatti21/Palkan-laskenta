import { paymentState, projectPayroll } from "./model.js";

const money = new Intl.NumberFormat("fi-FI",{style:"currency",currency:"EUR"});
const months = new Intl.DateTimeFormat("fi-FI",{month:"long",timeZone:"UTC"});
const byId = id => document.getElementById(id);
function node(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}
function sum(rows,key) {
  if (!rows.length || rows.some(row => !Number.isFinite(row.values[key]))) return "–";
  return money.format(rows.reduce((v,row) => v + Math.round(row.values[key]*100),0)/100);
}

export function installCompact() {
  const settings = document.querySelector('[data-view="data"]');
  settings.prepend(node("h2","Asetukset","compact-title"));
  for (const section of settings.querySelectorAll("[data-settings-disclosure]")) {
    const group = node("details","","compact-disclosure");
    const title = section.querySelector("h2");
    group.append(node("summary",title.textContent));
    section.before(group);
    group.append(section);
    title.hidden = true;
  }
  const planner = byId("plannerFrame");
  const jump = node("select","");
  jump.setAttribute("aria-label","Siirry laskurin osaan");
  jump.add(new Option("Siirry laskurin osaan",""));
  for (const [key,label] of [["history","Historian esitäyttö"],["weekends","Työaika ja viikonloput"],["income","Vuosibrutto"],["tax","Verokortit A/B"],["results","Tulokset"],["curves","Käyrät"],["sample","Vertailupisteet"]]) {
    jump.add(new Option(label,key+"-title"));
  }
  jump.onchange = () => {
    const target = planner.contentDocument?.getElementById(jump.value);
    if (target) { target.tabIndex = -1; target.focus(); target.scrollIntoView({block:"start"}); }
    jump.value = "";
  };
  planner.before(jump);
  const opening = byId("ledgerOpening");
  opening.querySelector("h2").textContent = "Seuranta";
  const month = node("select","");
  month.setAttribute("aria-label","Seurannan maksukuukausi");
  const lead = node("section","","compact-lead");
  const amount = node("strong","","compact-amount");
  const caption = node("p","");
  lead.append(month,amount,caption);
  const dashboard = byId("dashboard");
  opening.insertBefore(lead,dashboard);
  opening.append(byId("taxCardProgress"));
  const gross = node("div","","compact-gross");
  dashboard.after(gross);
  const sources = node("details","","compact-sources");
  byId("analysisNote").after(sources);
  document.addEventListener("compact-payments",({detail:{records,year,sourceName}})=>{
    const projection = projectPayroll(records);
    const realized = projection.active.filter(r=>r.values.payDate.startsWith(year+"-") && paymentState(r)==="realized");
    const keys = [...new Set(realized.map(r=>r.values.payDate.slice(0,7)))].sort().reverse();
    const previous = month.value;
    month.replaceChildren();
    for (const key of keys) month.add(new Option(months.format(new Date(key+"-01T12:00Z"))+" · tilille",key));
    if (keys.includes(previous)) month.value = previous;
    month.hidden = !keys.length;
    function update() {
      const rows = realized.filter(r=>r.values.payDate.startsWith(month.value));
      amount.textContent = sum(rows,"netPay");
      const count = new Set(rows.map(r=>r.incomeSourceId || "")).size;
      caption.textContent = rows.length ? "Maksuja "+rows.length+" · Tulolähteitä "+count : "Ei toteutuneita maksuja valitulle vuodelle";
      gross.textContent = rows.length ? "Kuukauden brutto · "+sum(rows,"grossPay") : "";
    }
    month.onchange = update;
    update();
    sources.replaceChildren(node("summary","Toteutuneet netot tulolähteittäin"));
    const groups = new Map();
    for (const row of realized) {
      const id = row.incomeSourceId;
      if (!groups.has(id)) groups.set(id,[]);
      groups.get(id).push(row);
    }
    for (const [id, rows] of groups) {
      const entry = node("div","","compact-source");
      entry.append(node("span",sourceName(id)),node("strong",sum(rows,"netPay")));
      sources.append(entry);
    }
    sources.hidden = !groups.size;
  });
  const paths = {
    tracking:"M3 11 12 3l9 8 M5 10v11h5v-7h4v7h5V10",
    history:"M4 5h16 M4 12h16 M4 19h16",
    analysis:"M3 20h18 M6 17v-5 M12 17V6 M18 17V9",
    planning:"M5 2h14v20H5z M8 7h8 M8 12h2 M14 12h2 M8 17h2 M14 17h2",
    data:"M3 6h18 M3 12h18 M3 18h18 M8 3v6 M16 9v6 M9 15v6"
  };
  for (const tab of document.querySelectorAll(".tabs .tab")) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 24 24"); svg.setAttribute("aria-hidden","true");
    const path = document.createElementNS(svg.namespaceURI,"path");
    path.setAttribute("d",paths[tab.dataset.viewTarget]); svg.append(path); tab.prepend(svg);
  }
}
