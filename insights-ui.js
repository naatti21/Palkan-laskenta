// Beta-only DOM presentation for read-only insights and explicitly labeled scenarios.
import { buildInsightReport, buildBudget, scenarioOvertime, reverseNetGoal } from "./insights.js";
import { getSetting, setSetting } from "./storage.js";
const el=id=>document.getElementById(id);
const eur=n=>n==null?"Ei tietoa":new Intl.NumberFormat("fi-FI",{style:"currency",currency:"EUR"}).format(n);
const num=n=>n==null?"Ei tietoa":new Intl.NumberFormat("fi-FI",{maximumFractionDigits:2}).format(n);
const date=s=>s?new Intl.DateTimeFormat("fi-FI").format(new Date(s+"T12:00:00")):"–";
const yes=n=>typeof n==="number"&&Number.isFinite(n);
const fieldVal=id=>{const v=el(id).value.trim().replace(",",".");return v===""?null:Number(v)};
let current=null;
let currentRecords=[];
function line(label,value) {
 const row=document.createElement("div");row.className="insight-line";
 const a=document.createElement("span"),b=document.createElement("strong");
 a.textContent=label;b.textContent=value;row.append(a,b);return row;
}
function metrics(id,entries) {
 const host=el(id);host.replaceChildren();
 for(const [label,value] of entries) {
  const box=document.createElement("div");box.className="metric";
  const name=document.createElement("span"),amount=document.createElement("strong");
  name.textContent=label;amount.textContent=value;box.append(name,amount);host.append(box);
 }
}
function displayFinance(r) {
 const m=r.money;
 const gap=m.grossNetDifference;
 const note=gap==null?"Ei riittävää tietoa":eur(gap);
 metrics("incomeBreakdown",[
  ["Maksettu brutto",eur(m.gross)],["Maksettu netto",eur(m.net)],
  ["Bruton ja neton erotus",note],["Kirjattu ennakonpidätys",eur(m.withholding)],
  ["Muu ero (ei eritelty)",eur(m.unexplainedDifference)],
  ["Netto / brutto (ei veroaste)",m.gross>0&&m.net!=null?num(100*m.net/m.gross)+" %":"Ei tietoa"],
  ["Tunnistetut bonus- ja kertakorvausrivit",r.bonusRows?eur(r.recognizedBonuses):"Ei eriteltyjä rivejä"]
 ]);
}
function displayOvertime(r) {
 const o=r.overtime;
 metrics("overtimeBreakdown",[
  ["Palkkarivien tuntiyksiköt",o.recordedHourTotal==null?"Ristiriitainen":num(o.recordedHourTotal)+" h"],
  ["Korotusosat bruttona",eur(o.moneyTotal)],
  ["Nimenomaisia OT-rivejä",o.explicitDocs+" / "+r.totalRecords+" laskelmaa"],
  ["Tuntemattomia OT-tietoja",o.unknownDocs+" laskelmaa"]
 ]);
 const host=el("overtimeTiers");host.replaceChildren();
 if(!o.tiers.length)host.append(line("Palkkalajeja","Ei erittelyä"));
 for(const t of o.tiers)host.append(line(t.label,num(t.hours)+" yks. · "+eur(t.grossSupplement)));
 el("overtimeCaution").textContent="Ylityörivit voivat olla samojen työtuntien eri korotusosia. Sunnuntai- ja viikkovapaakorvauksia ei lisätä tähän tuntisummaan. Palkkarivien yhteenlasku ei ole vielä työajanseurannasta varmennettu työaika."
  +(r.excludedConflicts?" Ristiriitaisista tietueista ei esitetä vuosiyhteensä.":"");
}
function displayPeriods(r) {
 const p=r.periods,h=el("periodSummary");h.replaceChildren();
 h.append(line("Aikaisin jakson alku",date(p.earliest)));
 h.append(line("Myöhäisin jakson loppu",date(p.latest)));
 h.append(line("Palkkakaudet, joissa työtä myös eri vuodelta",String(p.priorYearCrossings)));
 h.append(line("Palkkakausien päivämäärät löydetty",p.periodsAvailable+" / "+p.recordsTotal));
 for(const x of p.examples)h.append(line("Maksu "+date(x.payDate),date(x.start)+" – "+date(x.end)));
}
function displayBank(r) {
 const b=r.bank;
 metrics("bankSummary",[
  ["Pankista käyttö, kirjatut yksiköt",b.useDocs?num(b.useUnits)+" yks.":"Ei tietoa"],
  ["Pankkiin lisäys, etumerkilliset yksiköt",b.addDocs?num(b.addUnits)+" yks.":"Ei tietoa"],
  ["Havainnot käytöstä",b.useDocs+" / "+b.docs],
  ["Havainnot lisäyksestä",b.addDocs+" / "+b.docs]
 ]);
}
function displayMonthDetails(r) {
 const host=el("monthlyDetails");host.replaceChildren();
 const available=r.months.filter(m=>m.count || m.hasConflict);
 if(!available.length){host.append(line("Kuukaudet","Ei maksutietoja"));return}
 for(const m of available) {
  const details=document.createElement("details");details.className="month-expand";
  const summary=document.createElement("summary");
  summary.textContent=m.label+" · "+m.count+" laskelmaa · netto "+(m.hasConflict?"Tarkistettava":eur(m.net));
  details.append(summary);
  const body=document.createElement("div");body.className="insight-rows";
  for(const [label,val] of [
   ["Maksettu brutto",eur(m.gross)],["Maksettu netto",eur(m.net)],
   ["Brutto–netto-ero",eur(m.grossNetDifference)],["Ennakonpidätys",eur(m.withholding)],
   ["OT-palkkarivien yksiköt",m.overtimeHours==null?"Ei tietoa":num(m.overtimeHours)+" h"],
   ["OT-korotusosat brutto",eur(m.overtimeMoney)],
   ["Maksupäivät",m.payDates.map(date).join(", ")]
  ])body.append(line(label,val));
  if(m.hasConflict)body.append(line("Ristiriitaiset tiedot","Yhteissummia ei esitetä"));
  details.append(body);host.append(details);
 }
}
// Lightweight historical reference; median resists an isolated bonus payout.
// Do not double-count conflicting copies of the same pay event.
function incomeReference() {
  if (!current) return null;
  const raw = currentRecords.filter(r => r?.kind !== 'forecast'
    && r?.values?.payDate?.startsWith(String(current.year))
    && yes(r.values.grossPay) && r.values.grossPay > 0
    && yes(r.values.netPay) && r.values.netPay >= 0);
  const event = r => [r.values.payDate, r.values.payPeriodStart || '?', r.values.payPeriodEnd || '?'].join('|');
  const counts = new Map();
  for (const r of raw) counts.set(event(r), (counts.get(event(r)) || 0) + 1);
  const ordered = raw.filter(r => counts.get(event(r)) === 1)
    .sort((a,b) => a.values.payDate.localeCompare(b.values.payDate));
  if (!ordered.length) return null;
  const recent = ordered.slice(-6);
  const median = values => { const sorted = values.sort((a,b)=>a-b); const m = Math.floor(sorted.length/2); return sorted.length%2 ? sorted[m] : (sorted[m-1]+sorted[m])/2; };
  const typicalNet = median(recent.map(r => r.values.netPay));
  const typicalGross = median(recent.map(r => r.values.grossPay));
  const differences = recent.slice(1).map((r,i)=>(Date.parse(r.values.payDate)-Date.parse(recent[i].values.payDate))/86400000);
  const biweekly = differences.length>0 && differences.filter(d=>d>=12&&d<=17).length>=Math.ceil(differences.length*2/3);
  const monthlyEstimate = biweekly ? typicalNet*26/12 : null;
  const paid = ordered.at(-1);
  return {count:recent.length, latestNet:paid.values.netPay, latestDate:paid.values.payDate,
    typicalNet, typicalGross, monthlyEstimate,
    retained:typicalGross>0 ? Math.min(100,100*typicalNet/typicalGross) : null};
}

function syncBudget(r) {
 const input=el("budgetMonth");
 const previous=input.value;
 input.replaceChildren();
 for(const m of r.months.filter(x=>x.count>0)){
   const op=document.createElement("option");
   op.value=String(m.month);
   op.textContent=m.label+" · "+(m.hasConflict?"tarkistettava":eur(m.net));
   input.append(op);
 }
 if([...input.options].some(o=>o.value===previous))input.value=previous;
 else if(input.options.length)input.value=input.options[input.options.length-1].value;
 updateBudget();
}
function updateBudget() {
 if(!current)return;
 const source=el('budgetSource')?.value || 'month';
 const historical=incomeReference();
 const selected=current.months.find(x=>String(x.month)===el('budgetMonth').value);
 let net=selected?.net??null, label='Maksettu kuukausi '+(selected?.label||'');
 if(source==='latest') {
   net=historical?.latestNet??null;
   label='Viimeisin palkanmaksu '+(historical?.latestDate||'')+' (ei kuukauden summa)';
 }else if(source==='typical') {
   net=historical?.monthlyEstimate??null;
   label=historical?.monthlyEstimate==null?'Tyypillinen kuukausi (ei riittävää maksurytmin näyttöä)'
     :'Tyypillinen kuukausi ('+historical.count+' viimeisimmän nauhan mediaani × 26/12)';
 }
 const monthSelector=el('budgetMonth')?.closest('label');
 if(monthSelector && el('budgetSource'))monthSelector.hidden=source!=='month';
 const b=buildBudget(net);
 metrics('budgetSummary',b?[
  [label,eur(net)],
  ['Tarpeet 50 %',eur(b.needs)],
  ['Toiveet 30 %',eur(b.wants)],
  ['Säästö / velanlyhennys 20 %',eur(b.savings)]
 ]:[['Laskentapohja',source==='typical'?'Kahden viikon palkkarytmiä ei voitu varmistaa. Valitse viimeisin palkka tai toteutunut kuukausi.':'Valitse kuukausi, jossa on luotettavat nettotiedot.']]);
}

function updateScenarios() {
 if(!current)return;
 const rate=fieldVal("retainedRate");
 const hours=fieldVal("confirmedOvertime");
 const o=current.overtime;
 if(rate==null || rate<=0 || rate>100){
  metrics("overtimeScenario",[["Laskentaoletus","Syötä oma arvio käteen jäävästä prosentista (1–100)."]]);
 }else{
  const result=scenarioOvertime({grossSupplement:o.moneyTotal,recordedHours:o.lineHourTotal,
    confirmedHours:hours,retainedPct:rate});
  if(result){
   metrics("overtimeScenario",[
    ["OT-korotusosien brutto",eur(o.moneyTotal)],
    ["Arvio netosta, vain korotusosat",eur(result.estimatedNet)],
    ["Arvio €/palkkarivin tuntiyksikkö",eur(result.perRecordedUnit)],
    ["Arvio €/vahvistettu lisätyötunti",result.perConfirmedHour==null?"Odottaa vahvistettuja tunteja":eur(result.perConfirmedHour)]
   ]);
  } else metrics("overtimeScenario",[["Arvio","Ei riittävää, ristiriidatonta OT-tietoa"]]);
 }
 const last=[...currentRecords].filter(r=>r.kind!=="forecast"&&r.values?.payDate?.startsWith(String(current.year)))
   .sort((a,b)=>(a.values?.payDate||"").localeCompare(b.values?.payDate||"")).at(-1);
 const kta=last?.values?.kta;
 const premium=el("premiumComparison");premium.replaceChildren();
 if(yes(kta) && kta>0) {
  premium.append(line("Viimeisimmän laskelman KTA",eur(kta)+"/h"));
  premium.append(line("50 % lisä / 1 h",eur(Math.round(kta*50)/100)));
  premium.append(line("100 % lisä / 1 h",eur(kta)));
 }else premium.append(line("KTA","Ei tietoa — TES-korvausta ei arvioida"));
 updateNetGoal();
}
function updateNetGoal() {
 if(!current)return;
 const h=el('netGoalResult');h.replaceChildren();
 const source=incomeReference();
 if(source){
   h.append(line('Viimeisimmän palkkalaskelman netto',eur(source.latestNet)));
   h.append(line('Viimeisten '+source.count+' laskelman tyypillinen netto / palkka',eur(source.typicalNet)));
   h.append(line('Historiasta arvioitu kuukausinettotaso',source.monthlyEstimate==null?'Ei vahvistettua 14 päivän palkkarytmiä':eur(source.monthlyEstimate)));
 }
 const target=fieldVal('netGoal');
 if(target==null){h.append(line('Oma nettotavoite','Aseta tavoite, niin näet vertailun'));return;}
 if(!yes(target)||target<0){h.append(line('Nettotavoite','Anna kelvollinen positiivinen summa'));return;}
 h.append(line('Oma kuukausittainen nettotavoite',eur(target)));
 if(source?.monthlyEstimate!=null){
  const delta=target-source.monthlyEstimate;
  h.append(line(delta>0?'Tavoitteeseen puuttuu, karkea arvio':'Tavoitteen ylittävä netto, karkea arvio',eur(Math.abs(delta))));
 }
 const explicit=fieldVal('retainedRate');
 const retention=explicit!=null&&explicit>0&&explicit<=100?explicit:source?.retained??null;
 const gross=reverseNetGoal({targetNet:target,retainedPct:retention});
 if(gross!=null)h.append(line('Tarvittava brutto / kk ('+(explicit!=null?'oma %':'havaittu netto/brutto')+')',eur(gross)));
 else h.append(line('Bruttoarvio','Ei riittävää historiatietoa; tarkista verokortin vaikutus vuosisuunnittelijasta'));
}

export async function initInsightsUi() {
 for(const id of ["retainedRate","confirmedOvertime","netGoal"]) {
  const field=el(id);
  const stored=await getSetting("insights:v1:"+id);
  if(stored!=null)field.value=String(stored);
  field.addEventListener("input",()=>{
   updateScenarios();
   setSetting("insights:v1:"+id,field.value).catch(()=>{});
  });
 }
 const budgetSource=el('budgetSource');
 if(budgetSource){
   const previous=await getSetting('insights:v2:budgetSource');
   if(['month','latest','typical'].includes(previous))budgetSource.value=previous;
   budgetSource.addEventListener('change',()=>{
     updateBudget();
     setSetting('insights:v2:budgetSource',budgetSource.value).catch(()=>{});
   });
 }
 el("budgetMonth").addEventListener("change",updateBudget);
}
export function renderInsightsUi(records,year) {
 currentRecords=records;
 current=buildInsightReport(records,year);
 displayFinance(current);
 displayOvertime(current);
 displayPeriods(current);
 displayBank(current);
 displayMonthDetails(current);
 syncBudget(current);
 updateScenarios();
}
