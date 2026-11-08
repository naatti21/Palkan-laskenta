// Beta-only readout for the existing A/B planner — no parallel tax calculation.
// Reads the planner's displayed annual gross / annual after-withholding net.
// Monthly and fortnight values are arithmetic annual averages, never pay-date promises.
import { SUMMARY_INPUT_FIELDS, parseDisplayedEuro, parseWeekendCount, summaryBreakdown, cashFlowDifference, calculateTaxKnee, referenceWeekendAnalysis, optimizeWeekendWorkload } from './ab-summary-model.mjs';
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
function drawProgressChart(plan,rowA,rowB,year,nA,nB,cReference=null) {
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
  // C is a user-constrained workload from the PUBLIC net reference, not a
  // third withholding percentage. No unique point when no goal is selected.
  if(cReference?.selection){
    const gross=cReference.selection.gross;
    const cTax=referenceNet2026(gross);
    if(cTax){
      svg.append(progressSvg('circle',{cx:x(gross),cy:y(cTax.effectiveAllInPercent),
        r:7,fill:'#de95e3',stroke:'#101820','stroke-width':2,
        'data-series':'C'}));
      svg.append(progressSvg('title',{},'C: '+cReference.selection.n+' viikonloppua, '+
        money(gross)+' vuosibrutto, yleinen 2026 vero- ja maksutaso '+
        progressPct(cTax.effectiveAllInPercent)));
    }
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
  if(cReference?.selection){
    note.textContent+=' C: '+cReference.selection.n+' viikonloppua nettotavoitteen ja käyttäjän asettamien lisätyön ehtojen mukaan. '+
      'C käyttää vuoden 2026 yleistä veroviitettä.';
  }else if(cReference?.available){
    note.textContent+=' C: vuoden 2026 nettoviite jatkuu taulukoissa ja lisätyön nettokäyrässä. '+
      'Ilman nettotavoitetta ei nimetä yhtä optimaalista työmäärää.';
  }
}

const money=n=>Math.round(n).toLocaleString('fi-FI')+' €';
function displayedEuro(id) {
  return parseDisplayedEuro(document.getElementById(id)?.textContent);
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
    <h2 id="betaABHeading">Vuosiansio · A / B / C</h2>
    <p class="beta-ab-description">A ja B: omat verokorttiarviot. C: lisätyön hyöty ja tarvittava työmäärä vuoden 2026 veroviitteellä.</p>
    <div id="betaWeekendCountHint" class="beta-weekend-count-hint" hidden>
      <div class="beta-weekend-hint-line">
        <span>Viikkolepokorvauksista laskettu ehdotus</span>
        <strong id="betaWeekendCountValue">–</strong>
      </div>
      <div class="beta-weekend-hint-controls">
        <label for="betaRestHoursPerWeekend">Korvaustunteja / viikonloppu
          <input id="betaRestHoursPerWeekend" type="number" inputmode="decimal" min="1" max="24" step="0.5" value="8">
        </label>
        <button type="button" class="chip" id="betaApplyWeekendCount" disabled>Käytä A:ssa ja B:ssä</button>
      </div>
      <p id="betaWeekendCountEvidence" class="hint"></p>
    </div>
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
      <section class="beta-ab-option beta-ab-c" aria-label="C lisätyön kannattavuus ja optimointi">
        <h3>C · Lisätyön optimointi</h3>
        <p id="betaCCompare" class="hint">Vuoden 2026 yleinen veroviite. A/B ovat omia ennakonpidätysarvioita.</p>
        <label for="betaCTarget">Nettotavoite / kk (€) · valinnainen
          <input id="betaCTarget" type="number" inputmode="decimal" min="0" max="1000000" step="50" placeholder="Esim. 4 000">
        </label>
        <small>Työviikonloppuja vuodessa</small>
        <strong id="betaCCount">–</strong>
        <div><span>Vuosibrutto · C</span><b id="betaCGross">–</b></div>
        <div><span>Vuosinetto · C¹</span><b id="betaCNet">–</b></div>
        <div><span>Netto / kk (12)</span><b id="betaCMonth">–</b></div>
        <div><span>Netto / 2 viikkoa (26)</span><b id="betaCPeriod">–</b></div>
        <div><span id="betaCMarginalLabel">Lisänetto / työviikonloppu¹</span><b id="betaCMarginal">–</b></div>
        <p id="betaCReason" class="hint" role="status">Ilman omaa tavoitetta ei ole yhtä laskennallista optimia.</p>
        <p id="betaCFormula" class="hint"></p>
        <p id="betaCLimit" class="hint"></p>
        <details class="scenario-explain">
          <summary>Miten C valitsee työmäärän?</summary>
          <p class="hint">C etsii pienimmän työviikonloppujen määrän, jolla valitsemasi kuukausinettotavoite täyttyy. Lisänetto tarkoittaa koko seuraavasta työviikonlopusta jäävää arviota, ei lauantaityön tai sunnuntaityön tuntipalkkaa.</p>
          <p class="hint">Ilman tavoitetta C näyttää lisätyön vaikutuksen ja mahdollisen työmääräalueen, ei yhtä oikeaa lukua. Viitteen nettosumma perustuu vuoden 2026 yleisiin vero-oletuksiin; oma palkkapäivän netto voi erota. C:n laskelma näkyy A/B:n rinnalla myös taulukoissa ja käyrissä.</p>
        </details>
        <a href="https://www.veronmaksajat.fi/tutkimus-ja-tilastot/tuloverot/palkansaajan-veroprosentit/" target="_blank" rel="noopener noreferrer">Veroviitteen lähde (2026)</a>
        <button type="button" class="chip" id="betaCUseGoal" disabled>Aseta C tavoitteeksi Analyysiin</button>
        <p id="betaCStatus" class="hint" role="status" aria-live="polite"></p>
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
        <span class="p-c">C · 2026-viite</span>
      </div>
      <div id="betaProgressChart" class="beta-progress-chart"></div>
      <p id="betaProgressSummary" class="beta-progress-summary" role="status">Käyrä näkyy laskurin lukujen valmistuttua.</p>
      <p class="beta-progress-caveat">A/B-merkit näyttävät laskurin vähennysten osuuden, eivät virallista veroastetta. Vihreä käyrä sisältää työntekijän eläke- ja työttömyysvakuutusmaksut, keskimääräiset kunnallis- ja kirkollisverot sekä tavalliset vähennykset. Marginaali kertoo seuraavan ansaitun euron arvioidun verorasituksen. Vertailupisteet on harvennettu ja välit yhdistetty suorilla.</p>
      <a class="beta-progress-source" href="https://www.veronmaksajat.fi/tutkimus-ja-tilastot/tuloverot/palkansaajan-veroprosentit/" target="_blank" rel="noopener noreferrer">Lähde: Veronmaksajat, palkansaajan veroprosentit 2026</a>
    </div>`;
  // The independent A/B choices are the planner's main workflow, not a
  // second calculator bolted on after the charts.
  const weekendsPanel=document.getElementById('weekends-title')?.closest('section.card');
  if(!weekendsPanel)throw new Error('Missing planner weekend section');
  weekendsPanel.before(section);
  const cards=[section.querySelector('.beta-ab-a'),section.querySelector('.beta-ab-b')];
  const labels=[...section.querySelectorAll('.beta-ab-workload-grid label')];
  if(cards.some(x=>!x)||labels.length!==2)throw new Error('Missing A/B input cards');
  cards.forEach((card,i)=>{
    labels[i].firstChild.textContent='Työviikonloppuja vuodessa';
    card.querySelector('h3').after(labels[i]);
  });
  section.querySelector('.beta-ab-workload').remove();
  // These summary fields still receive updates for compatibility but must not
  // repeat the same gross amounts already printed inside each A/B card.
  section.querySelector('.beta-ab-gross').style.display='none';
  const caveats=document.createElement('details');
  caveats.className='scenario-explain beta-ab-explanation';
  const caution=document.createElement('summary');
  caution.textContent='Miten arviot on laskettu?';
  caveats.append(caution,...section.querySelectorAll('.beta-ab-caveat'));
  section.append(caveats);
  // One explanation area rather than multiple nested dropdown menus.
  const extraMetrics=document.createElement('div');
  extraMetrics.className='beta-extra-metrics';
  for(const [id,prefix] of [['betaABPeriodA','A'],['betaABPeriodB','B'],
    ['betaCGross','C'],['betaCNet','C'],['betaCPeriod','C']]){
    const metric=document.getElementById(id)?.closest('div');
    if(metric){
      const label=metric.querySelector('span');
      if(label)label.textContent=prefix+' · '+label.textContent;
      extraMetrics.append(metric);
    }
  }
  caveats.append(extraMetrics);
  for(const id of ['betaABBreakdown','betaCFormula','betaCLimit']){
    const node=document.getElementById(id);
    if(node)caveats.append(node);
  }
  const cDetails=section.querySelector('.beta-ab-c > details');
  if(cDetails){
    for(const note of [...cDetails.children].filter(node=>node.tagName!=='SUMMARY'))
      caveats.append(note);
    cDetails.remove();
  }
  const progress=section.querySelector('.beta-progress');
  const extra=document.createElement('section');
  extra.className='beta-ab-progress-details';
  extra.append(progress);
  oldComparison.insertAdjacentElement('afterend',extra);
  // Deep figures stay mounted, but a single deliberate expansion reveals them.
  const results=document.getElementById('results-title')?.closest('section.card');
  const curves=document.getElementById('curves-title')?.closest('section.card');
  if(!results||!curves)throw new Error('Missing detailed planner sections');
  const advanced=document.createElement('details');
  advanced.id='plannerAdvanced';
  advanced.className='scenario-explain planner-advanced';
  const advancedTitle=document.createElement('summary');
  advancedTitle.textContent='Tarkempi analyysi · käyrät, taulukot ja laskentaperusteet';
  advanced.append(advancedTitle);
  results.before(advanced);
  advanced.append(results,curves,oldComparison,extra);
  const inverse=document.getElementById('inverseGoalPanel');
  // Preserve the original inverse-goal tool inside the advanced panel for expert users.
  const december=document.getElementById('decemberTaxNote');
  if(december)advanced.append(december);
  const limits=[...oldComparison.querySelectorAll('details')].find(node=>
    node.querySelector('summary')?.textContent.includes('Mitä tässä mallissa'));
  if(limits){const p=limits.querySelector('p');if(p){p.classList.add('hint');limits.replaceWith(p);}}
  // Keep C in the same comparison group as A/B. On narrow phones it spans
  // both columns rather than compressing three numeric cards into tiny widths.

  // Keep the verified shared-scenario calculation as an internal A-reference.
  // Its duplicate week-count selector and presets are unnecessary once the
  // two primary A/B inputs are visible at the start.
  const oldCount=weekendsPanel.querySelector('.field:has(#weekends)');
  const oldPresets=weekendsPanel.querySelector('#presets');
  const oldFacts=weekendsPanel.querySelector('#hoursResult')?.closest('.grid');
  for(const item of [oldCount,oldPresets,oldFacts])if(item){item.hidden=true;item.style.display='none';}
  document.getElementById('weekends-title').textContent='1. Työviikonlopun tunnit';
  const oldHint=weekendsPanel.querySelector('.hint');
  if(oldHint)oldHint.textContent='Lauantai- ja sunnuntaitunnit ovat samat molemmissa vaihtoehdoissa. Työviikonloppujen määrät valitaan A- ja B-korteissa.';
  const taxLead=document.querySelector('#tax-title + .muted');
  if(taxLead)taxLead.textContent='Tarkista A- ja B-verokortin tuloraja sekä prosentit OmaVerosta. Vertailu perustuu omiin arvioihisi.';

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
    .beta-ab-c{grid-column:1/-1;}
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
    .p-ref::before{background:#70dea9}.p-marg::before{background:#f4bb67}.p-a::before{background:#81caff}.p-b::before{background:#bb9afb}.p-c::before{background:#f4d98f}
    .beta-progress-chart{width:100%;overflow:hidden;}
    .beta-progress-chart svg{display:block;width:100%;height:auto;max-height:320px;}
    .beta-progress-summary{font-size:.78rem;line-height:1.58;color:#e5eff9;background:#192432;border-left:3px solid #70dea9;padding:10px 11px;border-radius:6px;}
    .beta-progress-source{display:inline-block;margin-top:6px;color:#a6d6ff;font-size:.73rem;line-height:1.4;}
    .beta-ab-workload{margin:11px 0;border:1px solid #44576a;background:#17212b;border-radius:10px;padding:11px;}
    .beta-ab-workload-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;}
    .beta-ab-workload-grid label,.beta-ab-option>label{display:grid;gap:6px;min-width:0;color:#d6e2f1;font-size:.75rem;font-weight:700;margin:8px 0 10px;}
    .beta-ab-workload-grid input,.beta-ab-option>label input{width:100%;min-width:0;border:1px solid #647991;border-radius:8px;background:#0b151e;color:#fff;padding:9px;font:inherit;font-size:1rem;}
    .beta-ab-workload-a input{border-color:#6bba95}.beta-ab-workload-b input{border-color:#80a8e0}
    .beta-ab-workload-reset{font-size:.74rem;border:1px solid #59758a;border-radius:8px;color:#e0edfa;background:#283748;padding:8px 10px;margin-top:10px;cursor:pointer;}
    .beta-ab-workload-help{font-size:.72rem;color:#becddd;line-height:1.5;margin:8px 0 0;}
    .beta-ab-option>.beta-ab-card-gross{display:block;font-size:.98rem;color:#edf6ff;margin:4px 0 10px;white-space:nowrap;}
    .beta-ab-breakdown{font-size:.75rem;color:#c2d7e9;line-height:1.55;margin:9px 0;}
    @media(max-width:345px){.beta-ab-option{padding:10px 7px}.beta-ab-option>strong{font-size:1.04rem}.beta-ab-option b{font-size:.81rem}}

     .beta-ab-cards{margin:6px 0;gap:6px;}
     .beta-ab-option{padding:9px 9px;}
     .beta-ab-option h3{margin-bottom:4px;}
     .beta-ab-option>strong{margin:3px 0 6px;}
     .beta-ab-option>div{padding-top:5px;margin-top:4px;}
     .beta-ab-option>label{margin:5px 0 7px;}
     .beta-ab-description{margin:2px 0 7px;line-height:1.38;}
     .beta-ab-explanation{font-size:.78rem;}
     .beta-extra-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
     .beta-extra-metrics>div{display:grid;gap:2px;border-top:1px solid #374c57;padding-top:6px;}
     .beta-extra-metrics span{font-size:.73rem;}
     .beta-weekend-count-hint{padding:9px;border:1px solid #455b50;border-radius:9px;margin:8px 0;background:#152a23;}
     .beta-weekend-count-hint[hidden]{display:none!important;}
     .beta-weekend-hint-line{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:.77rem;}
     .beta-weekend-hint-line strong{white-space:nowrap;color:#aaf3c8;}
     .beta-weekend-hint-controls{display:flex;gap:8px;align-items:end;justify-content:space-between;margin-top:7px;}
     .beta-weekend-hint-controls label{display:grid;gap:3px;min-width:0;font-size:.72rem;color:#d5e9dc;}
     .beta-weekend-hint-controls input{max-width:74px;min-height:36px;border-radius:6px;background:#0c1814;color:white;border:1px solid #648576;padding:6px;}
     .beta-weekend-hint-controls button{min-height:36px;font-size:.72rem;white-space:normal;text-align:center;}
     .beta-weekend-count-hint p{font-size:.7rem;line-height:1.42;margin:7px 0 0;}
     .planner-advanced{margin-top:12px;padding:11px!important;border:1px solid #354d58;}
     .planner-advanced>summary{font-weight:700;font-size:.88rem;}
     .planner-advanced>section.card{padding:11px 7px;margin:11px 0;}
     .planner-advanced .beta-ab-progress-details{margin-top:14px;}
     html.beta-integrated .shell>.eyebrow,
     html.beta-integrated .shell>h1,
     html.beta-integrated .shell>.lead,
     html.beta-integrated .shell>.status[role="note"]{display:none;}
     html.beta-integrated .history-evidence{margin:7px 0;}
     html.beta-integrated .history-preview>.chips{margin-top:7px;}
     html.beta-integrated .history-preview>.hint{font-size:.72rem;}
     @media(max-width:345px){.beta-ab-option{padding:8px 6px}.beta-ab-option>strong{font-size:1.04rem}.beta-ab-option b{font-size:.81rem}.beta-weekend-hint-controls{flex-wrap:wrap}}
  `;
  document.head.append(css);
  const put=(id,value)=>{document.getElementById(id).textContent=value;};
  const weekFieldA=document.getElementById('betaWeekendsA');
  const weekFieldB=document.getElementById('betaWeekendsB');
  const chosenWeekends=field=>parseWeekendCount(field.value);
  const resultSection=document.getElementById('results-title')?.closest('section.card');
  if(resultSection&&!document.getElementById('betaCResult')){
    const results=resultSection.querySelector('.grid.two');
    const fact=document.createElement('div');
    fact.className='fact';
    fact.innerHTML='<small>C: yleinen veroviite 2026</small><strong id="betaCResult">–</strong><span>C:n arvioitu vuosinetto¹ tai saatavilla oleva vaihteluväli</span>';
    results?.append(fact);
  }
  const samplePanel=document.getElementById('sample-title')?.closest('section.card');
  if(samplePanel&&!document.getElementById('betaCSamplesNote')){
    const note=document.createElement('p');
    note.id='betaCSamplesNote';
    note.className='hint';
    note.textContent='¹ C: Veronmaksajien vuoden 2026 yleinen vuotuinen nettotulo (verot ja työntekijämaksut mukana). A/B: ennakonpidätyksen mukainen kassavirta. Merkki – tarkoittaa, ettei C-viite kata tätä tulotasoa.';
    samplePanel.querySelector('.comparison-table-wrap')?.before(note);
  }
  const nextImpact=document.getElementById('nextImpact');
  if(nextImpact&&!document.getElementById('betaCNextImpact')){
    const note=document.createElement('p');
    note.id='betaCNextImpact';note.className='hint';
    nextImpact.after(note);
  }
  const cButton=document.getElementById('betaCUseGoal');
  const cStatus=document.getElementById('betaCStatus');
  let currentC=null;

  // C is a third display series, *not* a third user-provided tax card.
  // Update the planner's existing tables and chart after its own render:
  // every row at the same weekend count uses the same underlying annual gross.
  const paintTables=(computed,reference,opt=null)=>{
    const summaries=['samples','allSamples'];
    for(const id of summaries){
      const body=document.getElementById(id);
      if(!body)continue;
      const header=body.closest('table')?.querySelector('thead tr');
      if(header&&!header.querySelector('[data-c-header]')){
        const th=document.createElement('th');
        th.dataset.cHeader='yes';
        th.textContent='C: netto¹';
        th.title='2026 Veronmaksajien yleinen vuosinettoviite, ei A/B-verokortin ennakonpidätys.';
        header.append(th);
      }
      for(const row of body.querySelectorAll('tr')){
        const n=Number(row.querySelector('.point-count')?.textContent);
        if(!Number.isInteger(n)||n<0||n>52)continue;
        const td=row.querySelector('.beta-c-net-cell')||document.createElement('td');
        td.className='beta-c-net-cell';
        td.textContent=reference?.points[n]?.net==null?'–':money(reference.points[n].net);
        if(!td.parentElement)row.append(td);
        if(reference?.knee?.n===n)row.dataset.cKnee='yes';
        else delete row.dataset.cKnee;
        if(opt?.selection?.n===n)row.dataset.cOptimized='yes';
        else delete row.dataset.cOptimized;
      }
    }
    // The core's compact comparison picks its own thresholds. Add a C-knee
    // row when absent; do not claim the A/B tax-card limits are C thresholds.
    const n=opt?.selection?.n??reference?.knee?.n,summary=document.getElementById('samples');
    if(!Number.isInteger(n)||!summary)return;
    const exists=[...summary.querySelectorAll('.point-count')].some(x=>Number(x.textContent)===n);
    if(exists)return;
    const from=document.getElementById('allSamples')?.querySelectorAll('tr')[n];
    if(!from)return;
    const row=from.cloneNode(true);
    if(reference?.knee?.n===n)row.dataset.cKnee='yes';
    if(opt?.selection?.n===n)row.dataset.cOptimized='yes';
    row.classList.add('threshold-point');
    const first=row.querySelector('td');
    const note=document.createElement('span');
    note.className='point-note';
    note.textContent=opt?.selection?.n===n?'C: nettotavoite':'Viitetaite';
    first?.append(note);
    const next=[...summary.querySelectorAll('tr')].find(x=>Number(x.querySelector('.point-count')?.textContent)>n);
    summary.insertBefore(row,next||null);
  };
  const svgNode=(tag,attributes={},label)=>{
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [key,val] of Object.entries(attributes))node.setAttribute(key,String(val));
    if(label!==undefined)node.textContent=label;
    return node;
  };
  const paintMarginalChart=(computed,reference,opt=null)=>{
    if(!reference?.available)return; // Keep original A/B chart if C is unavailable.
    const host=document.getElementById('netChart');
    if(!host)return;
    const W=740,H=267,L=68,R=20,T=29,B=43;
    const rows=computed.series.slice(1);
    const all=rows.flatMap(row=>[row.gainA,row.gainB,
      reference.points[row.n]?.gain]).filter(v=>Number.isFinite(v));
    const min=Math.min(0,...all),max=Math.max(1,...all);
    const hi=max===min?min+1:max;
    const x=n=>L+n/52*(W-L-R);
    const y=n=>T+(hi-n)/(hi-min)*(H-T-B);
    const svg=svgNode('svg',{viewBox:'0 0 740 267',role:'img',
      'aria-label':'Lisäviikonlopun netto: A ja B ennakonpidätysoletuksilla, C vuoden 2026 yleisellä veroviitteellä'});
    svg.append(svgNode('title',{},'A/B/C seuraavan viikonlopun lisänetto'));
    for(let i=0;i<=4;i++){
      const v=min+(hi-min)*i/4,yy=y(v);
      svg.append(svgNode('line',{class:'gridline',x1:L,y1:yy,x2:W-R,y2:yy}));
      svg.append(svgNode('text',{x:L-9,y:yy+4,'text-anchor':'end'},Math.round(v).toLocaleString('fi-FI')));
    }
    for(const n of [0,13,26,39,52])
      svg.append(svgNode('text',{x:x(n),y:H-13,'text-anchor':'middle'},String(n)));
    const specs=[
      {name:'A',value:row=>row.gainA,color:'#7cb4fc'},
      {name:'B',value:row=>row.gainB,color:'#f9c880'},
      {name:'C',value:row=>reference.points[row.n]?.gain,color:'#de95e3'}
    ];
    for(const spec of specs){
      let segment=[];
      const draw=()=>{
        if(segment.length>1)svg.append(svgNode('polyline',{
          class:'line',stroke:spec.color,fill:'none',
          points:segment.map(row=>x(row.n)+','+y(spec.value(row))).join(' ')
        }));
        segment=[];
      };
      for(const row of rows){
        if(Number.isFinite(spec.value(row)))segment.push(row);else draw();
      }
      draw();
    }
    const marked=opt?.selection?.n??reference.knee?.n??null;
    if(marked!==null){
      const cx=x(marked);
      svg.append(svgNode('line',{x1:cx,x2:cx,y1:T,y2:H-B,stroke:'#de95e3',
        'stroke-width':2,'stroke-dasharray':'5 5',
        ...(opt?.selection?{'data-c-selected':'yes'}:{})}));
      svg.append(svgNode('text',{x:Math.min(W-50,Math.max(L+50,cx)),y:T+13,
        'text-anchor':'middle',fill:'#f0c6f7','font-size':13},
        opt?.selection?'C '+marked:'Viitetaite '+marked));
    }
    svg.append(svgNode('text',{x:W/2,y:H-1,'text-anchor':'middle'},'Työviikonloppuja vuodessa'));
    host.replaceChildren(svg);
  };
  const netLegend=document.getElementById('netChart')?.previousElementSibling;
  if(netLegend?.classList?.contains('legend')&&!netLegend.querySelector('[data-c-legend]')){
    const item=document.createElement('span');
    item.dataset.cLegend='yes';
    const dot=document.createElement('i');
    dot.className='dot';dot.style.background='#de95e3';
    item.append(dot,document.createTextNode(' C: Veronmaksajat 2026¹'));
    netLegend.append(item);
  }
  const targetField=document.getElementById('betaCTarget');
  const optionalNumber=(field,max)=>{
    const raw=field.value.trim();
    if(!raw)return {ok:true,value:null};
    const n=Number(raw.replace(',','.'));
    return Number.isFinite(n)&&n>=0&&n<=max
      ?{ok:true,value:n}:{ok:false,value:null};
  };
  const renderC=computed=>{
    currentC=null;
    cButton.disabled=true;
    cStatus.textContent='';
    const putSafe=(id,value)=>put(id,value);
    const clear=(message,reference=null)=>{
      for(const id of ['betaCCount','betaCGross','betaCNet','betaCMonth',
        'betaCPeriod','betaCMarginal','betaCResult',
        'betaCFormula','betaCLimit'])
        putSafe(id,'–');
      putSafe('betaCCompare','C on yleinen veroviite, ei A/B:n ennakonpidätys.');
      putSafe('betaCReason',message);
      putSafe('betaCMarginalLabel','Lisänetto / työviikonloppu¹');
      putSafe('betaCNextImpact','');
      if(computed)paintTables(computed,reference);
    };
    if(!computed||!(computed.grossPerWeekend>0)){
      clear('Täytä perusansio ja yhden työviikonlopun brutto.');
      return null;
    }
    const target=optionalNumber(targetField,1000000);
    if(!target.ok){
      clear('Anna nettotavoite euroina tai jätä kenttä tyhjäksi.');
      return null;
    }
    const year=Number(document.getElementById('planYear')?.value);
    const reference=referenceWeekendAnalysis(computed.series,referenceNet2026,year,2026);
    if(!reference?.available){
      clear('Yleinen 2026-veroviite ei kata näitä lähtötuloja. C ei arvaa puuttuvaa verotusta.');
      return null;
    }
    const analysis=optimizeWeekendWorkload(reference.points,{
      targetMonthlyNet:target.value
    });
    if(!analysis?.available){
      clear('Veroviite ei kata lähtötuloa ja seuraavaa viikonloppua tai syötteet ovat virheellisiä.',
        reference);
      return reference;
    }
    const rows=reference.points;
    paintTables(computed,reference,analysis);
    paintMarginalChart(computed,reference,analysis);
    const aCount=chosenWeekends(weekFieldA);
    const next=Number.isInteger(aCount)&&aCount<52?rows[aCount+1]:null;
    putSafe('betaCNextImpact',next?.gain==null
      ?'C:n vertailu ei kata tämän lisäviikonlopun vuosituloja.'
      :'C (yleinen 2026-viite): '+(aCount+1)+'. lisäviikonloppu tuo noin '+
        money(next.gain)+' lisää käteen koko viikonlopusta. A/B käyttävät omia ennakonpidätysprosentteja.');
    const tag=reference.provisional
      ?'Suunnitteluvuosi '+year+': C käyttää vuoden 2026 yleisviitettä, ei vuoden '+year+' verolakia.'
      :'C käyttää vuoden 2026 julkaistua yleistä vuosinettoviitettä.';
    putSafe('betaCCompare',tag+' A/B kuvaavat verokortin ennakonpidätyksen jälkeistä rahaa; eurot eivät ole samaa verolaskentaa.');
    putSafe('betaCFormula','Vuoden lähtöbrutto '+money(rows[0].gross)+
      ' + '+money(reference.perWeekend)+' / työviikonloppu. C näyttää jokaisen kokonaisen lisäviikonlopun arvioidun neton.');
    putSafe('betaCLimit','2026-viite kattaa näillä tuloilla viikonloput 0–'+analysis.covered+
      '. Taulukon viitealue on 20 000–140 000 €; tietoja ei ekstrapoloida.');
    const targetText=target.value===null?'':'Nettotavoite '+money(target.value)+'/kk. ';
    const current=analysis.selection;
    const endCount=current?.n??analysis.eligibleMax;
    const displayed=rows[endCount];
    const endNet=displayed.net;
    const range=!current&&analysis.reason!=='target-unreachable';
    const output=(a,b,denominator=1)=>range
      ?money(a/denominator)+' – '+money(b/denominator):money(b/denominator);
    if(current){
      putSafe('betaCCount',current.n+' viikonloppua');
      putSafe('betaCGross',money(current.gross));
      putSafe('betaCNet',money(current.net));
      putSafe('betaCMonth',money(current.monthlyNet));
      putSafe('betaCPeriod',money(current.fortnightNet));
      putSafe('betaCMarginalLabel','Seuraava työviikonloppu · lisää käteen¹');
      putSafe('betaCMarginal',current.nextGain===null?'Ei seuraavaa (52 vkl)'
        :'+'+money(current.nextGain));
      putSafe('betaCReason',targetText+'Tähän riittää vähintään '+
        current.n+' työviikonloppua. Seuraavan koko viikonlopun arvioitu nettopalkkalisä näkyy yllä.');
      if(!reference.provisional) {
        currentC={found:true,n:current.n};
        cButton.disabled=false;
      } else cStatus.textContent='Alustavaa 2026-veroviitettä ei tallenneta vuoden '+year+' tavoitteeksi.';
    } else if(analysis.reason==='target-unreachable'){
      putSafe('betaCCount','Nettotavoite ei täyty');
      putSafe('betaCGross',money(displayed.gross));
      putSafe('betaCNet',money(endNet));
      putSafe('betaCMonth',money(endNet/12));
      putSafe('betaCPeriod',money(endNet/26));
      putSafe('betaCMarginalLabel','Viimeinen ehdot täyttävä viikonloppu · lisänetto¹');
      const lastGain=analysis.marginal[analysis.eligibleMax-1]?.gain;
      putSafe('betaCMarginal',Number.isFinite(lastGain)?'+'+money(lastGain):'–');
      putSafe('betaCReason',targetText+'Viite kattaa enintään '+
        analysis.eligibleMax+' kannattavaa työviikonloppua. Nettotavoitteesta jää '+
        money(analysis.missedBy)+' vuodessa puuttumaan. C ei nimeä mahdotonta tavoitetta optimaaliseksi.');
    } else {
      putSafe('betaCCount','0–'+analysis.eligibleMax+' viikonloppua');
      putSafe('betaCGross',output(rows[0].gross,displayed.gross));
      putSafe('betaCNet',output(analysis.baselineNet,endNet));
      putSafe('betaCMonth',output(analysis.baselineNet,endNet,12));
      putSafe('betaCPeriod',output(analysis.baselineNet,endNet,26));
      putSafe('betaCMarginalLabel','Lisänetto / viikonloppu · alussa → lopussa¹');
      putSafe('betaCMarginal','+'+money(analysis.firstGain)+' → +'+money(analysis.endGain));
      putSafe('betaCReason','Lisätyö kasvattaa nettotuloa mutta vie vapaa-aikaa. '+
        'Ilman nettotavoitetta ei ole yhtä laskennallista optimia. '+
        'Vertaa viikonloppujen määrää ja lisänettoa käyrässä ja taulukoissa.');
    }
    if(reference.provisional&&analysis.reason!=='target-met')
      cStatus.textContent='Vertailuvuosi '+year+' käyttää yhä vuoden 2026 veroviitettä.';
    putSafe('betaCResult',current
      ?money(current.net)+'¹ · '+current.n+' viikonloppua'
      :range?output(analysis.baselineNet,endNet)+'¹'
        :money(endNet)+'¹ · tavoitetta ei saavuteta');
    return {...reference,selection:current};
  };
  cButton.addEventListener('click',()=>{
    if(!currentC)return;
    const year=Number(document.getElementById('planYear')?.value);
    if(!Number.isInteger(year)||year<2020||year>2100)return;
    if(window.parent===window){
      cStatus.textContent='C-tavoitteen tallennus on käytettävissä Palkka Betassa.';
      return;
    }
    cStatus.textContent='Tallennetaan C-tavoite Analyysiin…';
    window.parent.postMessage({type:'palkka:beta:weekend-goal',year,goal:currentC.n},location.origin);
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent||
      event.data?.type!=='palkka:beta:weekend-goal-result')return;
    cStatus.textContent=event.data.ok
      ?'Tavoite '+event.data.goal+' viikonloppua tallennettu vuodelle '+event.data.year+'.'
      :'Tavoitetta ei voitu tallentaa.';
  });
  const syncModelFromA=()=>{
    const chosen=chosenWeekends(weekFieldA);
    if(chosen===null)return;
    const shared=document.getElementById('weekends');
    if(!shared||Number(shared.value)===chosen)return;
    shared.value=String(chosen);
    shared.dispatchEvent(new Event('input',{bubbles:true}));
  };
  const breakdown=()=>summaryBreakdown({
    ...Object.fromEntries(SUMMARY_INPUT_FIELDS.map(id=>[id,progressVal(id)])),
    weekends:parseWeekendCount(document.getElementById('weekends')?.value),
    weekendMethod:document.getElementById('weekendMethod')?.value||'manual',
    rulesConfirmed:!!document.getElementById('rulesConfirmed')?.checked
  },weekFieldA.value,weekFieldB.value,globalThis.PalkkaPlannerCore?.computePlan);
  const signed=n=>(n>=0?'+':'−')+money(Math.abs(n));
  const reset=message=>{
    for(const id of ['betaABGross','betaABGrossA','betaABGrossB',
      'betaABYearA','betaABYearB','betaABMonthA','betaABMonthB',
      'betaABPeriodA','betaABPeriodB'])put(id,'–');
    put('betaABCount','–');
    put('betaABDifference',message||'Tarkista puuttuvat tai virheelliset lähtöarvot.');
    put('betaABBreakdown','');
    renderC(null);
    document.getElementById('betaProgressChart')?.replaceChildren();
    const summary=document.getElementById('betaProgressSummary');
    if(summary)summary.textContent='Täytä kelvolliset laskurin lähtöarvot, niin vertailukäyrä ilmestyy.';
  };
  const update=()=>{
    const sharedGross=displayedEuro('grossResult');
    const sharedA=displayedEuro('netA'),sharedB=displayedEuro('netB');
    if(sharedGross==null||sharedA==null||sharedB==null||sharedGross<0){
      reset();return;
    }
    const state=breakdown();
    if(!state){
      reset('A- ja B-viikonloppujen määrän on oltava kokonaisluku 0–52. Varmista myös viikonlopun bruttokorvaus ja laskurin muut lähtöarvot.');
      return;
    }
    const {computed,a:nA,b:nB,reference,rowA,rowB}=state;
    if(Math.abs(reference.gross-sharedGross)>2 ||
       Math.abs(reference.netA-sharedA)>2 ||
       Math.abs(reference.netB-sharedB)>2) {
      reset('Laskuri päivittää vielä vertailuarvoja. Tarkista lähtöarvot.');
      return;
    }
    const year=document.getElementById('planYear')?.value||'–';
    const a=rowA.netA,b=rowB.netB;
    const same=nA===nB;
    put('betaABGross',same?money(rowA.gross):'Eri vuositulot');
    put('betaABGrossA',money(rowA.gross));
    put('betaABGrossB',money(rowB.gross));
    put('betaABCount',same
      ?'Vuosi '+year+' · '+nA+' työviikonloppua'
      :'Vuosi '+year+' · A: '+nA+' työviikonloppua · B: '+nB+' työviikonloppua');
    put('betaABYearA',money(a));put('betaABYearB',money(b));
    put('betaABMonthA',money(a/12));put('betaABMonthB',money(b/12));
    put('betaABPeriodA',money(a/26));put('betaABPeriodB',money(b/26));
    const delta=a-b;
    const text=Math.abs(delta)<.5?'A:n ja B:n arvioitu vuosikassavirta on sama.'
      :same
      ?(delta>0?'A':'B')+':lla jää näillä ennakonpidätysoletuksilla vuodessa käteen '+
        money(Math.abs(delta))+' enemmän (noin '+money(Math.abs(delta)/12)+'/kk).'
      :(delta>0?'A':'B')+'-vaihtoehdossa jää vuodessa käteen '+
        money(Math.abs(delta))+' enemmän. Ero sisältää sekä työn määrän että verokorttien ennakonpidätyksen vaikutuksen.';
    put('betaABDifference',text);
    if(!same){
      const {withholdingPart,workloadPart}=cashFlowDifference(rowA,rowB);
      put('betaABBreakdown','Nettoero A − B: työmäärän vaikutus '+signed(workloadPart)+
        ' · korttien pidätyseron vaikutus '+signed(withholdingPart)+
        '. Laskurin kaksisuuntainen vertailuerittely, ei lopullinen veropäätös.');
    }else put('betaABBreakdown','Sama työmäärä molemmissa: erotus kuvaa tämän laskurin verokorttioletusten eroa.');
    const cReference=renderC(computed);
    drawProgressChart(computed,rowA,rowB,year,nA,nB,cReference);
  };
  weekFieldA.addEventListener('input',()=>{syncModelFromA();update();});
  weekFieldA.addEventListener('change',update);
  weekFieldB.addEventListener('input',update);
  weekFieldB.addEventListener('change',update);
  for(const id of ['grossResult','netA','netB']){
    const node=document.getElementById(id);
    if(node)new MutationObserver(update).observe(node,{childList:true,characterData:true,subtree:true});
  }
  // Recompute C on every relevant underlying assumption, not only when a
  // rounded result node happens to change its displayed whole-euro text.
  for(const id of ['baseGross','weekendGross','sat','sun','holiday','bonus',
    'other','raise','raiseMonth','limitA','limitB','rateA','rateB',
    'extraA','extraB','otherDeductions','hourlyRate','ktaRate']){
    document.getElementById(id)?.addEventListener('input',update);
  }
  targetField.addEventListener('input',update);
  document.getElementById('weekendMethod')?.addEventListener('change',update);
  document.getElementById('rulesConfirmed')?.addEventListener('change',update);
  document.getElementById('planYear')?.addEventListener('input',update);
  document.getElementById('weekends')?.addEventListener('input',update);
  update();
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
}
