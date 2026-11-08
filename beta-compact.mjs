import { paymentState, projectPayroll } from "./model.js";
import { installWeekendTracker } from "./beta-weekend-tracker.mjs";

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
  installWeekendTracker();
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
  const opening = byId("ledgerOpening");
  opening.querySelector("h2").textContent = "Seuranta";

  // The personal gross goal was an unused Beta experiment. Keep its saved values
  // untouched; remove only the panel, never payroll data or the tax-card gauge.
  byId("yearProgressPanel")?.remove();

  const lead = node("section","","compact-lead");
  const latestLabel = node("span","Viimeisin toteutunut palkka");
  const latestAmount = node("strong","","compact-amount");
  const latestNote = node("p","");
  const latestGross = node("p","","compact-gross");
  const calendarJump = node("button","Näytä palkkapäivä kalenterissa");
  calendarJump.type = "button";
  calendarJump.className = "secondary";
  calendarJump.hidden = true;
  lead.append(latestLabel,latestAmount,latestNote,latestGross,calendarJump);

  const annual = node("section","","compact-lead");
  const annualTitle = node("strong","Vuoden koonti");
  const annualNet = node("p","","compact-gross");
  const annualGross = node("p","","compact-gross");
  const annualNote = node("p","","muted");
  annual.append(annualTitle,annualNet,annualGross,annualNote);

  const dashboard = byId("dashboard");
  opening.insertBefore(lead,dashboard);
  opening.insertBefore(annual,dashboard);
  // Latest net already has a dedicated headline above. Preserve the existing
  // YTD/net/brutto/overtime metrics, but show them only on explicit expansion
  // instead of repeating the same payday across the home screen.
  byId("dashboardDetails").before(dashboard);
  opening.append(byId("taxCardProgress"));
  let latestPayDate = null;

  calendarJump.addEventListener("click",()=>{
    if (!latestPayDate) return;
    const historyYear = byId("historyYear");
    const year = latestPayDate.slice(0,4);
    const calendar = byId("ledgerCalendar");
    // Set the requested day first. A change of year asynchronously rerenders
    // history; the calendar retains this pending selection until that render.
    calendar.dispatchEvent(new CustomEvent("ledger-jump",{detail:{date:latestPayDate}}));
    if (historyYear.value !== year && [...historyYear.options].some(x=>x.value===year)) {
      historyYear.value = year;
      historyYear.dispatchEvent(new Event("change",{bubbles:true}));
    }
    document.querySelector('[data-view-target="history"]')?.click();
  });

  const sources = node("section","","compact-sources");
  sources.style.cssText="margin-top:8px;padding:7px 0;border-top:1px solid #34464b";
  byId("analysisNote").after(sources);
  document.addEventListener("compact-payments",({detail:{records,year,sourceName}})=>{
    const projection = projectPayroll(records);
    const realized = projection.active.filter(r=>r.values?.payDate &&
      paymentState(r)==="realized");
    const ordered = [...realized].sort((a,b)=>a.values.payDate.localeCompare(b.values.payDate));
    latestPayDate = ordered.at(-1)?.values.payDate ?? null;
    const latest = latestPayDate ? ordered.filter(r=>r.values.payDate===latestPayDate) : [];
    latestAmount.textContent = sum(latest,"netPay");
    latestNote.textContent = latest.length
      ? "Maksupäivä "+new Intl.DateTimeFormat("fi-FI").format(new Date(latestPayDate+"T12:00:00"))+
        " · "+latest.length+" maksua"
      : "Ei vielä toteutuneita maksuja";
    latestGross.textContent = latest.length
      ? "Brutto "+sum(latest,"grossPay")+
        (latest.length===1 ? " · "+sourceName(latest[0].incomeSourceId) : " · Eri tulolähteet")
      : "";
    calendarJump.hidden = !latest.length;

    const yearRows = realized.filter(r=>r.values.payDate.startsWith(year+"-"));
    annualTitle.textContent = "Vuoden "+year+" koonti";
    annualNet.textContent = "Netto "+sum(yearRows,"netPay");
    annualGross.textContent = "Brutto "+sum(yearRows,"grossPay");
    const conflicts = projection.unresolved.filter(r=>!r.values?.payDate ||
      r.values.payDate.startsWith(year+"-"));
    annualNote.textContent = yearRows.length
      ? yearRows.length+" toteutunutta maksua · maksupäivän mukaan"+
        (conflicts.length ? " · Ratkaisemattomat palkat eivät sisälly summiin." : "")
      : "Ei toteutuneita maksuja valitulta vuodelta."+
        (conflicts.length ? " Ratkaisemattomat palkat tarkistetaan Historiassa." : "");
    if (yearRows.length && (yearRows.some(r=>!Number.isFinite(r.values.netPay)) ||
      yearRows.some(r=>!Number.isFinite(r.values.grossPay)))) {
      annualNote.textContent += " Osasta maksuja puuttuu summa: sitä ei arvioida.";
    }

    sources.replaceChildren(node("h3","Toteutuneet netot tulolähteittäin"));
    const groups = new Map();
    for (const row of yearRows) {
      const id = row.incomeSourceId;
      if (!groups.has(id)) groups.set(id,[]);
      groups.get(id).push(row);
    }
    for (const [id, rows] of groups) {
      const entry = node("div","","compact-source");
      entry.append(node("span",sourceName(id)),node("strong",sum(rows,"netPay")));
      sources.append(entry);
    }
    sources.hidden = groups.size < 2;
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
