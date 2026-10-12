import {deriveTaxDefaults,incrementalNet,taxCurve,nextHundred,weekendSimulation,validateScenario} from "./scenario-model.js";
import {getSetting,setSetting} from "./storage.js";

// Presentation is beta-only. No payroll record, tax card or imported backup is edited.
const id=x=>document.getElementById(x);
const nfmt=n=>new Intl.NumberFormat("fi-FI",{maximumFractionDigits:2}).format(n);
const eur=n=>n==null?"–":new Intl.NumberFormat("fi-FI",{style:"currency",currency:"EUR"}).format(n);
const num=v=>v===""||v==null?null:Number(String(v).replace(",","."));
const keys=["scenarioBaseRate","scenarioExtraRate","scenarioRemaining","scenarioOtherRate",
"scenarioWeekendGross","scenarioWeekendHours","scenarioWeekendCount","scenarioFreeValue"];
const defaults={scenarioWeekendGross:500,scenarioWeekendHours:16,scenarioWeekendCount:4,
  scenarioFreeValue:15,scenarioOtherRate:0};
let year=null;
let lastRecords=[];
function metric(host,label,value) {
 const box=document.createElement("div"),name=document.createElement("span"),big=document.createElement("strong");
 box.className="metric";name.textContent=label;big.textContent=value;box.append(name,big);host.append(box);
}
function svgElem(kind,props={},textValue=null) {
 const obj=document.createElementNS("http://www.w3.org/2000/svg",kind);
 for(const [key,val] of Object.entries(props))obj.setAttribute(key,String(val));
 if(textValue!=null)obj.textContent=textValue;
 return obj;
}
function drawChart(host,items,maxX,maxY,{labelX,breakX=null,lineY=null,altName=null}) {
 host.replaceChildren();
 if(!items.length||maxX<=0)return;
 const W=600,H=255,left=58,right=18,top=18,bottom=47;
 const plotW=W-left-right,plotH=H-top-bottom;
 const xp=n=>left+(n/maxX)*plotW;
 const yp=n=>top+plotH-(n/(Math.max(1,maxY)))*plotH;
 const svg=svgElem("svg",{viewBox:"0 0 600 255",class:"scenario-svg",role:"img","aria-label":labelX});
 svg.append(svgElem("title",{},labelX));
 for(let tick=0;tick<=4;tick++){
   const yv=maxY*tick/4,y=yp(yv);
   svg.append(svgElem("line",{x1:left,y1:y,x2:W-right,y2:y,stroke:"#34445e","stroke-width":1,"stroke-opacity":.7}));
   svg.append(svgElem("text",{x:left-9,y:y+4,"text-anchor":"end",fill:"#b7c4d8","font-size":12},String(Math.round(yv))+"€"));
 }
 svg.append(svgElem("line",{x1:left,y1:top,x2:left,y2:H-bottom,stroke:"#8593aa","stroke-width":1}));
 for(let tick=0;tick<=4;tick++){
   const x=left+tick*plotW/4;
   svg.append(svgElem("text",{x,y:H-27,"text-anchor":"middle",fill:"#b7c4d8","font-size":12},
    nfmt(maxX*tick/4)));
 }
 if(breakX!=null&&breakX>0&&breakX<maxX){
  const x=xp(breakX);
  svg.append(svgElem("line",{x1:x,y1:top,x2:x,y2:H-bottom,stroke:"#f59e0b","stroke-width":2,
    "stroke-dasharray":"5 5"}));
  svg.append(svgElem("text",{x:Math.min(W-right-10,Math.max(left+45,x+6)),y:top+15,
    "text-anchor":"middle",fill:"#fbbf24","font-size":12},"raja"));
 }
 if(lineY!=null){
  const y=yp(lineY);
  svg.append(svgElem("line",{x1:left,y1:y,x2:W-right,y2:y,stroke:"#f59e0b",
    "stroke-width":2,"stroke-dasharray":"6 4"}));
 }
 const path=(key,color)=>{
  const pts=items.map(row=>xp(row.x).toFixed(2)+","+yp(row[key]).toFixed(2)).join(" ");
  svg.append(svgElem("polyline",{points:pts,fill:"none",stroke:color,"stroke-width":3,
    "stroke-linejoin":"round","stroke-linecap":"round"}));
  for(const row of items.filter((_,i)=>items.length<15||i===0||i===items.length-1)) {
   svg.append(svgElem("circle",{cx:xp(row.x),cy:yp(row[key]),r:items.length<15?3.5:2.2,fill:color}));
  }
 };
 path("main","#60a5fa");
 if(altName)path("compare","#a78bfa");
 svg.append(svgElem("text",{x:W/2,y:H-6,"text-anchor":"middle",fill:"#b7c4d8","font-size":13},labelX));
 host.append(svg);
}
function readInputs() {
 return {baseRate:num(id("scenarioBaseRate").value),extraRate:num(id("scenarioExtraRate").value),
  remainingLimit:num(id("scenarioRemaining").value),otherRate:num(id("scenarioOtherRate").value)};
}
function report(result) {
 const host=id("scenarioHundred");host.replaceChildren();
 metric(host,"Seuraava 100 € → käteen",eur(result.net));
 metric(host,"Ennakonpidätys tästä 100 eurosta",eur(result.withholding));
 metric(host,"Vertailu: ennen tulorajaa",eur(result.belowLimit));
 metric(host,"Vertailu: tulorajan jälkeen",eur(result.aboveLimit));
}
function resetOutput(hostIDs){
 for(const key of hostIDs)id(key).replaceChildren();
}
function repaint() {
 const config=readInputs();
 if(!validateScenario(config)){
  id("scenarioTaxStatus").textContent="Täytä perusprosentti, lisäprosentti ja tulorajaa jäljellä. Ilman näitä en arvaa laskelmaa.";
  id("scenarioTaxExplanation").textContent="";
  id("scenarioWeekendStatus").textContent="Viikonloppujen skenaario avautuu, kun yllä olevat verokortin oletukset ovat kunnossa.";
  id("scenarioWeekendExplanation").textContent="";
  resetOutput(["scenarioHundred","scenarioTaxChart","scenarioWeekendMetrics","scenarioWeekendChart"]);
  return;
 }
 const part=nextHundred(config);
 report(part);
 const weekendGross=num(id("scenarioWeekendGross").value);
 const count=num(id("scenarioWeekendCount").value);
 const chartMax=Math.min(12000,Math.max(2000,config.remainingLimit+1000,(weekendGross||0)*(count||0)));
 const t=taxCurve(config,chartMax);
 const maxY=Math.max(1,...t.rows.map(r=>Math.max(r.net,r.noStepNet)));
 drawChart(id("scenarioTaxChart"),t.rows.map(r=>({x:r.gross,main:r.net,compare:r.noStepNet})),
   chartMax,maxY,{labelX:"Lisäpalkka bruttona (€)",breakX:t.breakAt,altName:"vertailu"});
 if(config.remainingLimit===0){
  id("scenarioTaxStatus").textContent="Tulorajaa jäljellä: 0 €. Skenaariossa seuraava euro menee heti lisäprosentilla.";
 }else if(config.remainingLimit>chartMax){
  id("scenarioTaxStatus").textContent="Tuloraja ei vielä ylity piirretyllä lisäpalkan välillä.";
 }else{
  id("scenarioTaxStatus").textContent="Verokortin tulorajaa jäljellä "+eur(config.remainingLimit)+". Viivan taitos on tässä kohdassa.";
 }
 id("scenarioTaxExplanation").textContent=
 "Tässä skenaariossa seuraavasta 100 eurosta jäisi "+eur(part.net)+
 ". Osuus voi pienentyä tulorajan ylityttyä, mutta lisäpalkka kasvattaa edelleen nettoa. Muutosverokortti voi siirtää rajaa.";
 const w=weekendSimulation(config,{weekendGross:weekendGross,weekendHours:num(id("scenarioWeekendHours").value),
   weekendCount:count,freeHourValue:num(id("scenarioFreeValue").value)});
 if(!w){
  id("scenarioWeekendStatus").textContent="Täytä viikonlopun lisäbrutto (yli 0 €), aika, lukumäärä ja vapaa-ajan vertailuarvo.";
  id("scenarioWeekendExplanation").textContent="";
  resetOutput(["scenarioWeekendMetrics","scenarioWeekendChart"]);
  return;
 }
 const first=w.periods[0],last=w.periods.at(-1);
 const h=id("scenarioWeekendMetrics");h.replaceChildren();
 metric(h,"Ensimmäinen viikonloppu · arvioitu lisänetto",eur(first.net));
 metric(h,"Ensimmäinen viikonloppu · €/menetetty tunti",eur(first.euroPerHour));
 metric(h,w.periods.length+" viikonloppua · lisänetto yhteensä",eur(w.cumulativeNet));
 metric(h,"Vapaa-ajan oma vertailuarvo / viikonloppu",eur(first.leisure));
 const ymax=Math.max(1,...w.periods.map(x=>Math.max(x.net,x.leisure)))*1.15;
 drawChart(id("scenarioWeekendChart"),w.periods.map(p=>({x:p.index,main:p.net,compare:p.leisure})),
  w.periods.length,ymax,{labelX:"Työviikonloppujen määrä",altName:"vapaa-aika"});
 const detail=w.firstBelowLeisure==null
  ? "Yksikään valituista viikonlopuista ei alita omaa vapaa-ajan arvoasi näillä oletuksilla."
  : "Ensimmäinen alitus tapahtuu viikonloppuna "+w.firstBelowLeisure+". Tämä on oma vertailukohta, ei lakisääteinen raja.";
 const tax=w.firstHigherWithholding==null
  ? "Verokortin tuloraja ei ylity näiden työviikonloppujen lisäansioista."
  : "Lisäprosentille siirtyminen alkaa viimeistään viikonloppuna "+w.firstHigherWithholding+".";
 id("scenarioWeekendStatus").textContent=tax;
 id("scenarioWeekendExplanation").textContent=detail+
  " Viimeisen valitun viikonlopun arvioitu lisänetto on "+eur(last.net)+
  ". Kokonaisansiot ja tehty työaika ovat omia kokeiluoletuksiasi, eivät palkkalaskelmasta tunnistettuja.";
}
let loadedYear=null;
let lastSource=null;
async function setDefaults(records,chosenYear){
 const source=deriveTaxDefaults(records,chosenYear);
 const previous=await getSetting("scenario:v1:"+chosenYear);
 const normalized={
  scenarioBaseRate:source.baseRate,scenarioExtraRate:source.extraRate,
  scenarioRemaining:source.remainingLimit,scenarioOtherRate:0,...defaults
 };
 // User assumptions are local, year-specific overrides. New payroll imports do not silently change them.
 const applied={...normalized,...(previous&&typeof previous==="object"?previous:{})};
 for(const key of keys)id(key).value=applied[key]==null?"":String(applied[key]);
 const missing=[];
 if(source.baseRate==null)missing.push("perusprosentti");
 if(source.extraRate==null)missing.push("lisäprosentti");
 if(source.remainingLimit==null)missing.push("tulorajan kertymä");
 const src=source.sourceDate?"Viimeisimmän laskelman maksupäivä "+source.sourceDate.split("-").reverse().join(".")+". ":"";
 id("taxCardSource").textContent=src+(missing.length
  ?"Seuraavia ei löytynyt vahvistettuna: "+missing.join(", ")+". Voit antaa ne itse tässä kokeilussa."
  :"Lähtöarvot haettu tallennetun laskelman verokorttikentistä. Voit muuttaa niitä vain tätä kokeilua varten.")
  +" Muut maksut 0 % tarkoittaa, ettei niitä ole laskettu mukaan.";
 loadedYear=chosenYear;
 lastSource=source.sourceDate;
 repaint();
}
export function initScenarioUi() {
 for(const key of keys){
  const field=id(key);
  field.addEventListener("input",()=>{
   repaint();
   if(loadedYear!==null){
    const data=Object.fromEntries(keys.map(k=>[k,id(k).value===""?null:num(id(k).value)]));
    setSetting("scenario:v1:"+loadedYear,data).catch(()=>{});
   }
  });
  field.addEventListener("change",repaint);
 }
}
export async function renderScenarioUi(records,chosenYear) {
 if(chosenYear!==loadedYear)await setDefaults(records,chosenYear);
 else repaint();
}
