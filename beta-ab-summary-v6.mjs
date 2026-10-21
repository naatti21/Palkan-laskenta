// Beta-only readout for the existing A/B planner — no parallel tax calculation.
// Reads the planner's displayed annual gross / annual after-withholding net.
// Monthly and fortnight values are arithmetic annual averages, never pay-date promises.
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
    <p class="beta-ab-description">Sama valittu työmäärä ja sama brutto molemmilla korteilla. Nettosummat tulevat yllä olevasta laskurista.</p>
    <div class="beta-ab-gross">
      <span>Arvioitu vuosibrutto</span>
      <strong id="betaABGross">–</strong>
      <small id="betaABCount">–</small>
    </div>
    <div class="beta-ab-cards">
      <section class="beta-ab-option beta-ab-a" aria-label="Verokortti A:n tulokset">
        <h3>Verokortti A</h3>
        <small>Vuodessa käteen</small><strong id="betaABYearA">–</strong>
        <div><span>Netto / kk (12)</span><b id="betaABMonthA">–</b></div>
        <div><span>Netto / 2 viikkoa (26)</span><b id="betaABPeriodA">–</b></div>
      </section>
      <section class="beta-ab-option beta-ab-b" aria-label="Verokortti B:n tulokset">
        <h3>Verokortti B</h3>
        <small>Vuodessa käteen</small><strong id="betaABYearB">–</strong>
        <div><span>Netto / kk (12)</span><b id="betaABMonthB">–</b></div>
        <div><span>Netto / 2 viikkoa (26)</span><b id="betaABPeriodB">–</b></div>
      </section>
    </div>
    <p class="beta-ab-difference" id="betaABDifference" role="status">Täytä laskurin lähtöarvot vertailua varten.</p>
    <p class="beta-ab-caveat">A/B perustuu käyttäjän syöttämiin ennakonpidätysprosentteihin,
    tulorajoihin ja muihin mallin vähennyksiin. Vertailu kertoo arvioidusta
    <strong>palkasta käteen jäävästä kassavirrasta</strong>, ei lopullisesta verosta
    tai verokortin paremmuudesta. Kuukausi- ja 2 viikon luvut ovat vuosikeskiarvoja,
    eivät yksittäisen palkkakauden tarkkoja ennusteita.</p>
    <p class="beta-ab-caveat">Yllä oleva vuoden 2026 yleinen nettovertailu käyttää
    <strong>eri laskentaperustetta</strong> kuin tämä A/B-skenaario. Näitä
    prosentteja ei pidä yhdistää.</p>`;
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
    @media(max-width:345px){.beta-ab-option{padding:10px 7px}.beta-ab-option>strong{font-size:1.04rem}.beta-ab-option b{font-size:.81rem}}
  `;
  document.head.append(css);
  const put=(id,value)=>{document.getElementById(id).textContent=value;};
  const reset=()=>{
    for(const id of ['betaABGross','betaABYearA','betaABYearB','betaABMonthA','betaABMonthB','betaABPeriodA','betaABPeriodB'])put(id,'–');
    put('betaABCount','–');
    put('betaABDifference','Tarkista puuttuvat tai virheelliset lähtöarvot.');
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
