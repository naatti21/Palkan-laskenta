// Beta-only readout for the existing A/B planner — no parallel tax calculation.
// Reads the planner's displayed annual gross / annual after-withholding net.
// Monthly and fortnight values are arithmetic annual averages, never pay-date promises.
import { NET_ANCHORS_2026, referenceNet2026 } from './net-reference-2026.mjs';

// 2026 comparison, not a personalized tax calculator. Annual A/B estimates
// are planner cash flow; their deduction share is NOT an official tax rate.
// Marginal figures at these points are from Veronmaksajat' 2026 table.
const MARGINAL_2026 = Object.freeze([
  [20000,35.9],[30000,40.2],[40000,47.7],[45000,50.4],
  [50000,50.4],[51000,49.6],[52000,48.4],[53000,48.4],
  [55000,48.4],[60000,52.3],[70000,52.3],[80000,52.3],
  [90000,52.3],[100000,52.3],[120000,52.3],[140000,52.3]
]);
export function progressComparison2026(gross, netA, netB) {
  const ref=referenceNet2026(gross);
  if(!ref || ![netA,netB].every(n=>Number.isFinite(n) && n>=0 && n<=gross)) return null;
  return {gross,referencePercent:ref.effectiveAllInPercent,
    aDeductionPercent:(1-netA/gross)*100,
    bDeductionPercent:(1-netB/gross)*100};
}
const progressPct=n=>n.toLocaleString('fi-FI',{maximumFractionDigits:1})+' %';
const progressSvg=(tag,attrs={},label)=>{
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));
  if(label!==undefined)node.textContent=label;
  return node;
};
const progressVal=id=>{
  const text=document.getElementById(id)?.value;
  if(text==null)return null;
  const n=Number(text); // Planner also treats an empty optional number as zero.
  return Number.isFinite(n)?n:null;
};
function drawProgressChart(plan,rowA,rowB,year,nA,nB) {
  const host=document.getElementById('betaProgressChart');
  const note=document.getElementById('betaProgressSummary');
  if(!host||!note)return;
  host.replaceChildren();
  const a=progressComparison2026(rowA.gross,rowA.netA,rowA.netA);
  const b=progressComparison2026(rowB.gross,rowB.netB,rowB.netB);
  const baseline=plan.baseline;
  const low=NET_ANCHORS_2026[0][0],high=NET_ANCHORS_2026.at(-1)[0];
  if(!a||!b) {
    note.textContent='Jompikumpi vuosibrutto on 2026 viiteaineiston 20 000–140 000 € alueen ulkopuolella. Vertailukäyrä ei arvaa puuttuvia veroasteita.';
    return;
  }
  const W=600,H=310,L=55,R=20,T=20,B=54;
  const plotW=W-L-R,plotH=H-T-B;
  const x=v=>L+(v-low)/(high-low)*plotW;
  const y=v=>T+(60-v)/60*plotH;
  const svg=progressSvg('svg',{viewBox:'0 0 600 310',role:'img',
    'aria-label':'Vuoden 2026 vertailu: kokonaisveroaste, marginaalivero sekä A:n ja B:n omien vuositulojen laskurivähennykset.'});
  svg.append(progressSvg('title',{},'Veroprogressio 2026, A ja B erikseen'));
  for(let p=0;p<=60;p+=15){
    const yy=y(p);
    svg.append(progressSvg('line',{x1:L,y1:yy,x2:W-R,y2:yy,stroke:'#394858','stroke-width':1}));
    svg.append(progressSvg('text',{x:L-8,y:yy+4,'text-anchor':'end',fill:'#c3cfdd','font-size':12},p+' %'));
  }
  for(let t=20000;t<=140000;t+=20000){
    const xx=x(t);
    svg.append(progressSvg('text',{x:xx,y:H-26,'text-anchor':'middle',fill:'#c3cfdd','font-size':12},(t/1000)+'k'));
  }
  svg.append(progressSvg('text',{x:W/2,y:H-5,'text-anchor':'middle',fill:'#c3cfdd','font-size':12},'Vuositulo, €'));
  const line=(items,color,dashed=false)=>{
    const pts=items.map(([gross,rate])=>x(gross).toFixed(1)+','+y(rate).toFixed(1)).join(' ');
    svg.append(progressSvg('polyline',{points:pts,fill:'none',stroke:color,
      'stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round',
      ...(dashed?{'stroke-dasharray':'7 5'}:{})}));
  };
  line(NET_ANCHORS_2026.map(([g,net])=>[g,100*(1-net/g)]),'#70dea9');
  line(MARGINAL_2026,'#f4bb67',true);
  const guide=(value,color,label)=>{
    if(value<low||value>high)return;
    const xx=x(value);
    svg.append(progressSvg('line',{x1:xx,y1:T,x2:xx,y2:H-B,stroke:color,
      'stroke-width':2,'stroke-dasharray':'3 5','stroke-opacity':.82}));
    svg.append(progressSvg('text',{x:Math.min(W-55,Math.max(L+45,xx)),y:T+14,
      'text-anchor':'middle',fill:color,'font-size':11},label));
  };
  if(Math.abs(baseline-rowA.gross)>250||Math.abs(baseline-rowB.gross)>250)
    guide(baseline,'#8eadd6','Perus');
  if(Math.abs(rowA.gross-rowB.gross)<=.5)guide(rowA.gross,'#e9f2ff','Valittu');
  else {
    guide(rowA.gross,'#81caff','A');
    guide(rowB.gross,'#bb9afb','B');
  }
  for(const [gross,percent,color,label] of [
    [rowA.gross,a.aDeductionPercent,'#81caff','A'],
    [rowB.gross,b.bDeductionPercent,'#bb9afb','B']
  ]){
    if(percent<0||percent>60)continue;
    svg.append(progressSvg('circle',{cx:x(gross),cy:y(percent),r:6,fill:color,
      stroke:'#101820','stroke-width':2}));
    svg.append(progressSvg('title',{},label+': vuosibrutto '+money(gross)+
      ', laskurin vähennysosuus '+progressPct(percent)));
  }
  host.append(svg);
  const baseRef=referenceNet2026(baseline);
  const shift=(Math.abs(rowA.gross-baseline)>.5||Math.abs(rowB.gross-baseline)>.5)&&baseRef
    ?' Ilman valittuja työviikonloppuja: '+money(baseline)+
      ' → viiteveroaste '+progressPct(baseRef.effectiveAllInPercent)+'.':'';
  const yearWarning=Number(year)===2026?''
    :' Suunnitteluvuosi '+year+' — vertailukäyrä on silti vuoden 2026 tasoa.';
  if(nA===nB){
    note.textContent='Valittu vuosibrutto '+money(rowA.gross)+
      ' → 2026 yleinen kokonaisveroaste '+progressPct(a.referencePercent)+'.'+shift+
      ' Laskurin A-vaihtoehdossa palkasta vähentyy '+progressPct(a.aDeductionPercent)+
      ' ja B-vaihtoehdossa '+progressPct(b.bDeductionPercent)+
      '. Nämä A/B-luvut kuvaavat ennakonpidätystä ja muita laskurin vähennyksiä, eivät lopullista veroastetta.'+
      yearWarning;
  } else {
    note.textContent='A: '+nA+' työviikonloppua, brutto '+money(rowA.gross)+
      ', vuoden 2026 viiteveroaste '+progressPct(a.referencePercent)+
      ', laskurin vähennysosuus '+progressPct(a.aDeductionPercent)+
      '. B: '+nB+' työviikonloppua, brutto '+money(rowB.gross)+
      ', viiteveroaste '+progressPct(b.referencePercent)+
      ', laskurin vähennysosuus '+progressPct(b.bDeductionPercent)+
      '.'+shift+' A/B-vähennysosuus ei ole lopullinen veroaste.'+yearWarning;
  }
}

const money=n=>Math.round(n).toLocaleString('fi-FI')+' €';
function displayedEuro(id) {
  const node=document.getElementById(id);
  const original=node?.textContent?.trim()||'';
  if(original==='–'||original==='')return null;
  const cleaned=original.replace(/[\s\u00a0\u202f€]/g,'').replace('−','-').replace(',','.');
  if(!/^-?\d+(?:\.\d+)?$/.test(cleaned))return null;
  const number=Number(cleaned);
  return Number.isFinite(number) ? number : null;
}
function mount() {
  if(document.getElementById('betaAnnualABSummary'))return;
  const oldComparison=document.getElementById('sample-title')?.closest('section.card');
  if(!oldComparison)return;
  const section=document.createElement('section');
  section.className='card beta-ab-summary';
  section.id='betaAnnualABSummary';
  section.setAttribute('aria-labelledby','betaABHeading');
  section.innerHTML=`
    <p class="eyebrow">YHTEENVETO · OMA VALINTA</p>
    <h2 id="betaABHeading">Vuosiansio ja verokortit A / B</h2>
    <p class="beta-ab-description">Yllä olevan laskurin käyrät näyttävät <strong>saman viikonloppumäärän verokorttivertailun</strong>. Tässä loppuyhteenvedossa voit valita A:lle ja B:lle eri työmäärät. Nettotulokset lasketaan edelleen samalla laskurimallilla.</p>
    <div class="beta-ab-workload" role="group" aria-label="Verokorttivaihtoehtojen työviikonloppumäärät">
      <div class="beta-ab-workload-grid">
        <label class="beta-ab-workload-a">A · työviikonloppuja / vuosi
          <input id="betaWeekendsA" type="number" inputmode="numeric" min="0" max="52" step="1" value="0">
        </label>
        <label class="beta-ab-workload-b">B · työviikonloppuja / vuosi
          <input id="betaWeekendsB" type="number" inputmode="numeric" min="0" max="52" step="1" value="0">
        </label>
      </div>
      <button type="button" id="betaWeekendsReset" class="beta-ab-workload-reset">Palauta sama määrä kuin yllä</button>
      <p class="beta-ab-workload-help">Aluksi molemmissa käytetään yllä valittua viikonloppumäärää. Kun muutat A:n tai B:n lukua, omat vertailumäärät pysyvät itsenäisinä.</p>
    </div>
    <div class="beta-ab-gross">
      <span>Arvioitu vuosibrutto</span>
      <strong id="betaABGross">–</strong>
      <small id="betaABCount">–</small>
    </div>
    <div class="beta-ab-cards">
      <section class="beta-ab-option beta-ab-a" aria-label="Verokortti A:n tulokset">
        <h3>Verokortti A</h3>
        <small>Vuosibrutto</small><b class="beta-ab-card-gross" id="betaABGrossA">–</b>
        <small>Vuodessa käteen</small><strong id="betaABYearA">–</strong>
        <div><span>Netto / kk (12)</span><b id="betaABMonthA">–</b></div>
        <div><span>Netto / 2 viikkoa (26)</span><b id="betaABPeriodA">–</b></div>
      </section>
      <section class="beta-ab-option beta-ab-b" aria-label="Verokortti B:n tulokset">
        <h3>Verokortti B</h3>
        <small>Vuosibrutto</small><b class="beta-ab-card-gross" id="betaABGrossB">–</b>
        <small>Vuodessa käteen</small><strong id="betaABYearB">–</strong>
        <div><span>Netto / kk (12)</span><b id="betaABMonthB">–</b></div>
        <div><span>Netto / 2 viikkoa (26)</span><b id="betaABPeriodB">–</b></div>
      </section>
    </div>
    <p class="beta-ab-difference" id="betaABDifference" role="status">Täytä laskurin lähtöarvot vertailua varten.</p>
    <p class="beta-ab-breakdown" id="betaABBreakdown"></p>
    <p class="beta-ab-caveat">A/B perustuu käyttäjän syöttämiin ennakonpidätysprosentteihin,
    tulorajoihin ja muihin mallin vähennyksiin. Vertailu kertoo arvioidusta
    <strong>palkasta käteen jäävästä kassavirrasta</strong>, ei lopullisesta verosta
    tai verokortin paremmuudesta. Kuukausi- ja 2 viikon luvut ovat vuosikeskiarvoja,
    eivät yksittäisen palkkakauden tarkkoja ennusteita.</p>
    <p class="beta-ab-caveat">Yllä oleva vuoden 2026 yleinen nettovertailu käyttää
    <strong>eri laskentaperustetta</strong> kuin tämä A/B-skenaario. Näitä
    prosentteja ei pidä yhdistää.</p>
    <div class="beta-progress" aria-labelledby="betaProgressTitle">
      <h3 id="betaProgressTitle">Veroprogressio 2026 · vertailukuva</h3>
      <p class="beta-progress-desc">Vuoden 2026 viitekäyrä ja A/B-vaihtoehtojen omat vuositulot. Verokortin pidätyksen ja lopullisen veron ero säilyy.</p>
      <div class="beta-progress-legend">
        <span class="p-ref">Kokonaisveroaste</span>
        <span class="p-marg">Marginaalivero</span>
        <span class="p-a">Laskuri A</span>
        <span class="p-b">Laskuri B</span>
      </div>
      <div id="betaProgressChart" class="beta-progress-chart"></div>
      <p id="betaProgressSummary" class="beta-progress-summary" role="status">Käyrä näkyy laskurin lukujen valmistuttua.</p>
      <p class="beta-progress-caveat">A/B-merkit näyttävät laskurin vähennysten osuuden, eivät virallista veroastetta. Vihreä käyrä sisältää työntekijän eläke- ja työttömyysvakuutusmaksut, keskimääräiset kunnallis- ja kirkollisverot sekä tavalliset vähennykset. Marginaali kertoo seuraavan ansaitun euron arvioidun verorasituksen. Vertailupisteet on harvennettu ja välit yhdistetty suorilla.</p>
      <a class="beta-progress-source" href="https://www.veronmaksajat.fi/tutkimus-ja-tilastot/tuloverot/palkansaajan-veroprosentit/" target="_blank" rel="noopener noreferrer">Lähde: Veronmaksajat, palkansaajan veroprosentit 2026</a>
    </div>`;
  oldComparison.insertAdjacentElement('afterend',section);
  const css=document.createElement('style');
  css.textContent=`
    .beta-ab-summary{background:#111920!important;border:1px solid #394956!important;padding:14px!important;margin-top:11px!important;}
    .beta-ab-summary h2{font-size:1.15rem;margin:4px 0 9px;letter-spacing:-.025em;}
    .beta-ab-description{font-size:.79rem;line-height:1.5;color:#c5d3df;margin:5px 0 11px;}
    .beta-ab-gross{display:grid;gap:3px;padding:11px 12px;border-radius:11px;background:#192531;border:1px solid #3d5269;}
    .beta-ab-gross>span{color:#ccd8e8;font-size:.76rem;}
    .beta-ab-gross strong{color:#e7f4ff;font-size:1.4rem;font-weight:850;line-height:1.22;font-variant-numeric:tabular-nums;}
    .beta-ab-gross small{font-size:.72rem;color:#aec0d0;}
    .beta-ab-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:11px 0;}
    .beta-ab-option{min-width:0;background:#1a272f;border:1px solid #3c5965;border-radius:11px;padding:11px 10px;}
    .beta-ab-a{border-color:#427b62;background:#182c24;}
    .beta-ab-b{border-color:#567194;background:#1a2635;}
    .beta-ab-option h3{color:#f3f9ff;font-size:.92rem;margin:0 0 9px;}
    .beta-ab-option>small{display:block;color:#c6d8e2;font-size:.70rem;}
    .beta-ab-option>strong{display:block;font-size:clamp(1.09rem,4.1vw,1.42rem);font-weight:840;white-space:nowrap;letter-spacing:-.025em;font-variant-numeric:tabular-nums;margin:4px 0 12px;color:#aaf3c8;}
    .beta-ab-b>strong{color:#c4dcff;}
    .beta-ab-option>div{display:grid;gap:3px;border-top:1px solid #3e4b54;padding-top:8px;margin-top:7px;}
    .beta-ab-option>div>span{font-size:.69rem;color:#c6d3e0;line-height:1.33;}
    .beta-ab-option b{font-size:.91rem;color:#f4f9fd;font-variant-numeric:tabular-nums;white-space:nowrap;}
    .beta-ab-difference{border-left:3px solid #7bbcff;background:#1b2736;border-radius:8px;padding:10px 12px;color:#d8e9ff;font-size:.81rem;font-weight:720;line-height:1.5;}
    .beta-ab-caveat{font-size:.74rem;line-height:1.55;color:#bfcddd;margin:10px 0 0;}
    .beta-progress{border-top:1px solid #3e4e60;margin-top:18px;padding-top:14px;}
    .beta-progress h3{font-size:1.02rem;color:#f2f8ff;margin:0 0 7px;}
    .beta-progress-desc,.beta-progress-caveat{font-size:.75rem;line-height:1.55;color:#c2d2df;margin:7px 0;}
    .beta-progress-legend{display:flex;flex-wrap:wrap;gap:7px 13px;margin:11px 0 3px;font-size:.7rem;color:#d4e0ec;}
    .beta-progress-legend span::before{content:'';display:inline-block;width:12px;height:4px;border-radius:3px;margin-right:5px;vertical-align:middle;}
    .p-ref::before{background:#70dea9}.p-marg::before{background:#f4bb67}.p-a::before{background:#81caff}.p-b::before{background:#bb9afb}
    .beta-progress-chart{width:100%;overflow:hidden;}
    .beta-progress-chart svg{display:block;width:100%;height:auto;max-height:320px;}
    .beta-progress-summary{font-size:.78rem;line-height:1.58;color:#e5eff9;background:#192432;border-left:3px solid #70dea9;padding:10px 11px;border-radius:6px;}
    .beta-progress-source{display:inline-block;margin-top:6px;color:#a6d6ff;font-size:.73rem;line-height:1.4;}
    .beta-ab-workload{margin:11px 0;border:1px solid #44576a;background:#17212b;border-radius:10px;padding:11px;}
    .beta-ab-workload-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;}
    .beta-ab-workload-grid label{display:grid;gap:6px;min-width:0;color:#d6e2f1;font-size:.75rem;font-weight:700;}
    .beta-ab-workload-grid input{width:100%;min-width:0;border:1px solid #647991;border-radius:8px;background:#0b151e;color:#fff;padding:9px;font:inherit;font-size:1rem;}
    .beta-ab-workload-a input{border-color:#6bba95}.beta-ab-workload-b input{border-color:#80a8e0}
    .beta-ab-workload-reset{font-size:.74rem;border:1px solid #59758a;border-radius:8px;color:#e0edfa;background:#283748;padding:8px 10px;margin-top:10px;cursor:pointer;}
    .beta-ab-workload-help{font-size:.72rem;color:#becddd;line-height:1.5;margin:8px 0 0;}
    .beta-ab-option>.beta-ab-card-gross{display:block;font-size:.98rem;color:#edf6ff;margin:4px 0 10px;white-space:nowrap;}
    .beta-ab-breakdown{font-size:.75rem;color:#c2d7e9;line-height:1.55;margin:9px 0;}
    @media(max-width:345px){.beta-ab-option{padding:10px 7px}.beta-ab-option>strong{font-size:1.04rem}.beta-ab-option b{font-size:.81rem}}
  `;
  document.head.append(css);
  const put=(id,value)=>{document.getElementById(id).textContent=value;};
  const reset=()=>{
    for(const id of ['betaABGross','betaABYearA','betaABYearB','betaABMonthA','betaABMonthB','betaABPeriodA','betaABPeriodB'])put(id,'–');
    put('betaABCount','–');
    put('betaABDifference','Tarkista puuttuvat tai virheelliset lähtöarvot.');
    document.getElementById('betaProgressChart')?.replaceChildren();
    const summary=document.getElementById('betaProgressSummary');
    if(summary)summary.textContent='Täytä laskurin lähtöarvot, niin vertailukäyrä ilmestyy.';
  };
  const update=()=>{
    const gross=displayedEuro('grossResult'),a=displayedEuro('netA'),b=displayedEuro('netB');
    if(gross==null||a==null||b==null||gross<0){reset();return;}
    const year=document.getElementById('planYear')?.value||'–';
    const weekends=document.getElementById('weekends')?.value||'0';
    put('betaABGross',money(gross));
    put('betaABCount',`Vuosi ${year} · ${weekends} työviikonloppua`);
    put('betaABYearA',money(a));put('betaABYearB',money(b));
    put('betaABMonthA',money(a/12));put('betaABMonthB',money(b/12));
    put('betaABPeriodA',money(a/26));put('betaABPeriodB',money(b/26));
    const delta=a-b;
    const text=Math.abs(delta)<.5?'A:n ja B:n arvioitu vuosikassavirta on sama.'
      :`${delta>0?'A':'B'}:lla jää näillä ennakonpidätysoletuksilla vuodessa käteen
      ${money(Math.abs(delta))} enemmän (noin ${money(Math.abs(delta)/12)}/kk).`;
    put('betaABDifference',text);
    drawProgressChart(gross,a,b,year,weekends);
  };
  for(const id of ['grossResult','netA','netB']){
    const node=document.getElementById(id);
    if(node)new MutationObserver(update).observe(node,{childList:true,characterData:true,subtree:true});
  }
  document.getElementById('planYear')?.addEventListener('input',update);
  document.getElementById('weekends')?.addEventListener('input',update);
  update();
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
}
