import { paymentState, projectPayroll } from "./model.js";
import { buildYearAnalysis } from "./analytics.js";
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
  // One focused deep-dive instead of many full-height analysis cards.
  const analysis=document.querySelector('[data-view="analysis"]');
  if(analysis&&!analysis.querySelector('#betaAnalysisDeepDive')){
    const sections=[...analysis.children].filter(n=>n.matches?.('section.card'));
    if(sections.length>2){
      const more=node('details','','compact-analysis-deep');
      more.id='betaAnalysisDeepDive';
      more.append(node('summary','Tarkemmat palkka- ja työaikatiedot'));
      sections[2].before(more);
      for(const section of sections.slice(2))more.append(section);
    }
  }
  // Beta-only, information-first legal view: payslips contain pay-period
  // overtime observations but cannot establish a 48 h weekly average or
  // remaining legal capacity without actual work-time records.
  const workTimeLaw=node("details","","beta-worktime-law");
  workTimeLaw.id="betaWorkTimeLaw";
  const lawTitle=node("summary","Ylityöt ja työajan enimmäismäärä");
  const lawBody=node("div","","beta-worktime-law-body");
  const overtimeObservation=node("p","Ei ylityötietoja valitulta vuodelta.");
  overtimeObservation.id="betaWorkTimeObserved";
  const dataCoverage=node("p","","beta-worktime-caution");
  dataCoverage.id="betaWorkTimeCoverage";
  const capacity=node("p","Voiko ylityötä tehdä lisää? Ei pääteltävissä pelkistä palkkalaskelmista.","beta-worktime-decision");
  capacity.id="betaWorkTimeCapacity";
  const statute=node("p","Työaikalain 18 §:n mukaan kokonaistyöaika ylityöt mukaan lukien saa olla keskimäärin enintään 48 h viikossa neljän kuukauden tarkastelujaksolla. Tämä ei ole 8 tunnin viikoittainen ylityökiintiö, eikä yksittäisen viikon 48 tunnin ehdoton katto.");
  const agreement=node("p","Teknologiateollisuuden työntekijöiden TES 2025–2027, kohta 20.3: enimmäistyöajan tarkastelujakso on lähtökohtaisesti kalenterivuosi; paikallisesti voidaan sopia muun vuoden pituisen jakson käyttämisestä. Sovella vain, jos juuri tämä TES koskee työsuhdetta.");
  const scope=node("p","Lisätuntien arviointi edellyttää työnantajan työaikakirjanpidon kaikkia toteutuneita työtunteja, oikeaa tarkastelujaksoa sekä suunniteltuja työvuoroja ja lepoaikoja. Pelkkä ylityörivien määrä tai maksupäivä ei riitä.");
  const sources=node("div","","beta-worktime-links");
  const addLawSource=(label,url)=>{
    const a=node("a",label);
    a.href=url;a.target="_blank";a.rel="noopener noreferrer";sources.append(a);
  };
  addLawSource("Työaikalaki 18 § · Finlex","https://www.finlex.fi/fi/lainsaadanto/2019/872");
  addLawSource("Teknologiateollisuuden TES 20.3 · Teollisuusliitto","https://www.teollisuusliitto.fi/wp-content/uploads/2025/04/Teknologiateollisuuden-tyontekijoiden-tyoehtosopimus-2025-2027.pdf");
  lawBody.append(overtimeObservation,dataCoverage,capacity,statute,agreement,scope,sources);
  workTimeLaw.append(lawTitle,lawBody);
  (byId("betaWeekendTracker")||byId("analysisMetrics"))?.after(workTimeLaw);
  const lawStyle=document.createElement("style");
  lawStyle.textContent=`
    .beta-worktime-law{margin:8px 0 2px;border:1px solid #36505c;border-radius:9px;background:#111d26;min-width:0;max-width:100%;box-sizing:border-box;padding:8px 10px}
    .beta-worktime-law>summary{cursor:pointer;font-weight:700;font-size:.87rem;line-height:1.4}
    .beta-worktime-law-body{margin-top:8px;border-top:1px solid #314450;padding-top:7px}
    .beta-worktime-law-body p{margin:5px 0 9px;font-size:.76rem;line-height:1.48;overflow-wrap:anywhere}
    .beta-worktime-law-body .beta-worktime-decision{font-weight:650;color:#f4d2a3;border-left:2px solid #dcaf7c;padding-left:8px}
    .beta-worktime-law-body .beta-worktime-caution{font-size:.72rem;color:#b9cad5}
    .beta-worktime-links{display:flex;flex-wrap:wrap;gap:7px 14px;margin-top:9px}
    .beta-worktime-links a{font-size:.72rem;color:#9bdaff;overflow-wrap:anywhere}
  `;
  document.head.append(lawStyle);
  document.addEventListener("compact-payments",({detail})=>{
    const year=Number(detail?.year);
    if(!Number.isInteger(year)||year<1900||year>2200)return;
    const overtime=buildYearAnalysis(detail?.records||[],year).overtime;
    const known=overtime.recordsWithHours;
    const total=overtime.recordsTotal;
    overtimeObservation.textContent=known
      ? "Palkkalaskelmien ylityötuntihavainnot maksuvuodelta "+year+": "+
        new Intl.NumberFormat("fi-FI",{maximumFractionDigits:2}).format(overtime.knownHours)+" h"+
        (overtime.complete?"":" (osittainen tieto)")
      : "Ei luotettavia ylityötuntihavaintoja maksuvuodelta "+year+".";
    dataCoverage.textContent="Tuntitieto "+known+"/"+total+" yksiselitteisestä palkkalaskelmasta."+
      (overtime.excludedConflicts
        ? " Lisäksi "+overtime.excludedConflicts+" ristiriitaista tai ajoittamatonta tietuetta jätetty pois."
        : "")+
      " Maksuvuosi ei kerro, minä päivinä työ tehtiin; puuttuvat laskelmat eivät tarkoita nollatunteja.";
    capacity.textContent="Voiko ylityötä tehdä vielä lisää? Ei laskettavissa näistä palkkalaskelmista.";
  });
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
