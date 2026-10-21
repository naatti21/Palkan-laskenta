// Palkka Beta: indicative 2026 whole-year net comparison, not a tax-card calculator.
// Source: Veronmaksajain Keskusliitto, "Palkansaajan veroprosentit 2026",
// https://www.veronmaksajat.fi/tutkimus-ja-tilastot/tuloverot/palkansaajan-veroprosentit/
// Public comparative figures below are sparse EUR/year reference anchors.
// Their sample uses average municipal (7.57%) and church (1.38%) taxes, normal
// automated deductions, and includes TyEL and unemployment contributions.
// Interpolation is NOT an official or personalized Finnish tax assessment.
// This file is copied only into the isolated _beta planner iframe.
export const REFERENCE_YEAR = 2026;
export const NET_ANCHORS_2026 = Object.freeze([
  [20000,17987],[30000,24316],[40000,30268],[45000,32880],
  [50000,35358],[51000,35854],[52000,36363],[53000,36879],
  [55000,37910],[60000,40415],[70000,45185],[80000,49954],
  [90000,54723],[100000,59492],[120000,69031],[140000,78569]
].map(p => Object.freeze(p)));

export function referenceNet2026(annualGross) {
  if (typeof annualGross !== "number" || !Number.isFinite(annualGross) ||
      annualGross < NET_ANCHORS_2026[0][0] ||
      annualGross > NET_ANCHORS_2026.at(-1)[0]) return null;
  for (let i=0;i<NET_ANCHORS_2026.length-1;i++) {
    const [g1,n1] = NET_ANCHORS_2026[i], [g2,n2] = NET_ANCHORS_2026[i+1];
    if (annualGross < g1 || annualGross > g2) continue;
    const net = n1+(annualGross-g1)*(n2-n1)/(g2-g1);
    return { gross:annualGross, net, effectiveAllInPercent:
      (1-net/annualGross)*100, interpolated: annualGross !== g1 && annualGross !== g2 };
  }
  const last = NET_ANCHORS_2026.at(-1);
  return {gross:last[0],net:last[1],effectiveAllInPercent:(1-last[1]/last[0])*100,interpolated:false};
}

const eur = amount => Math.round(amount).toLocaleString("fi-FI")+" €";
const pct = amount => amount.toLocaleString("fi-FI",{maximumFractionDigits:1})+" %";
function readFinite(id) {
  const node=document.getElementById(id);
  if (!node || node.value.trim()==="") return null;
  const number=Number(node.value);
  return Number.isFinite(number) ? number : null;
}

function getWeekendGross() {
  const weekends=readFinite("weekends"),sat=readFinite("sat"),sun=readFinite("sun");
  if (weekends == null || !Number.isInteger(weekends) || weekends<0 || weekends>52 ||
      sat==null || sun==null || sat<0 || sun<0 || sat>24 || sun>24) return null;
  if (!weekends) return 0;
  if (document.getElementById("weekendMethod")?.value === "paylines") {
    if (!document.getElementById("rulesConfirmed")?.checked) return null;
    const hourly=readFinite("hourlyRate"),kta=readFinite("ktaRate");
    if (!(hourly>0&&kta>0)) return null;
    const regular=sat+sun;
    const eligible=Math.min(8,sat)+Math.min(8,sun);
    const weekly50=.5*Math.min(8,eligible)*kta;
    const weekly100=Math.max(0,eligible-8)*kta;
    const daily100=(Math.max(0,sat-8)+Math.max(0,sun-8))*kta;
    const sunday=sun*kta,rest=sun*kta;
    return weekends*(regular*hourly+weekly50+weekly100+daily100+sunday+rest);
  }
  const unit=readFinite("weekendGross");
  return unit>0 ? weekends*unit*(sat+sun)/16 : null;
}

function mountPreview() {
  if(document.getElementById("betaNetReference2026"))return;
  const history = document.getElementById("history-title")?.closest("section.card");
  if (!history)return;
  const host=document.createElement("section");
  host.id="betaNetReference2026";
  host.className="card netref26";
  host.setAttribute("aria-labelledby","netref26Title");
  host.innerHTML=`
    <div class="netref26-head"><h2 id="netref26Title">Perusansio: brutto → netto</h2><span>2026 viitearvio</span></div>
    <p class="muted">Koko vuoden perusansio ilman ylityöviikonloppuja. Yleinen vuoden 2026 vero- ja maksuarvio, ei oma verokorttisi.</p>
    <div class="netref26-annual" aria-label="Vuoden brutto ja arvioitu netto">
      <div><small>Vuosibrutto</small><strong id="netref26GrossAnnual">–</strong></div>
      <div><small>Arvioitu vuosinetto</small><strong id="netref26NetAnnual">–</strong></div>
    </div>
    <div class="netref26-cards" id="netref26Numbers">
      <div><small>Arvioitu netto / kk (12)</small><strong id="netref26Monthly">–</strong></div>
      <div><small>Arvioitu netto / 2 viikkoa (26)</small><strong id="netref26Fortnight">–</strong></div>
    </div>
    <div class="netref26-summary" id="netref26Summary" role="status" aria-live="polite">
      Täytä perusansiot alempana tai hyväksy palkkahistorian ehdotus.
    </div>
    <label class="netref26-option"><input id="netref26IncludeExtra" type="checkbox">
      Sisällytä myös erikseen syötetyt lomarahat, bonukset ja muut tulot vertailuun
    </label>
    <div class="netref26-overtime" id="netref26Overtime" hidden>
      <strong id="netref26OvertimeTitle"></strong>
      <span id="netref26OvertimeText"></span>
    </div>
    <p class="netref26-yearnote" id="netref26YearWarning"></p>
    <details class="netref26-source">
      <summary>Mistä vero- ja nettoarvio tulee?</summary>
      <p>Viite perustuu vuoden 2026 verojen ja työntekijämaksujen yhteenlaskettuun
      vaikutukseen. Vertailutaulukossa on keskimääräinen kunnallisvero ja
      kirkollisvero sekä tavalliset automaattiset vähennykset. Välitulot
      arvioidaan taulukon pisteiden väliltä. TyEL ja työttömyysvakuutusmaksu
      sisältyvät kokonaistasoon; niitä ei vähennetä toistamiseen.</p>
      <p>Esimerkin yhteisprosentti <strong>ei ole verokortin perusprosentti</strong>.
      Henkilökohtainen tulos muuttuu asuinkunnan, kirkon jäsenyyden, vähennysten,
      muiden tulojen ja vuoden mukaan. Luvut ovat vuotuinen keskiarvo,
      eivät yhden palkkakauden toteutunutta ennakonpidätystä.</p>
      <p><a href="https://www.veronmaksajat.fi/tutkimus-ja-tilastot/tuloverot/palkansaajan-veroprosentit/"
        target="_blank" rel="noopener noreferrer">Lähde: Veronmaksajat, veroprosentit 2026</a>.
      Tarkista oma <a href="https://www.vero.fi/henkiloasiakkaat/verokortti-ja-veroilmoitus/verokortti/veroprosenttilaskuri/"
        target="_blank" rel="noopener noreferrer">veroprosentti Verohallinnolta</a>.</p>
      <p>Tämä näkymä ei muuta A/B-verokorttien prosentteja, tulorajoja
      eikä palkkahistoriaa. Ei laskelmaa vuoden 2027 verolaista.</p>
    </details>
  `;
  const css=document.createElement("style");
  css.textContent=`
    .netref26 { margin-top:10px;border-color:#425669!important;background:#202a35!important;padding:14px!important; }
    .netref26-head{display:flex;align-items:center;justify-content:space-between;gap:12px;}
    .netref26-head h2{margin:0;font-size:1.06rem;letter-spacing:-.025em;}
    .netref26-head span{white-space:nowrap;font-size:.72rem;color:#ffe1b4;background:#4b3b32;border:1px solid #745b43;padding:5px 7px;border-radius:7px;font-weight:750;}
    .netref26 .muted{margin:9px 0;font-size:.78rem;line-height:1.5;}
    .netref26-annual{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0 10px;}
    .netref26-annual>div{background:#182531;border:1px solid #3a5067;border-radius:12px;padding:11px 10px;min-width:0;}
    .netref26-annual>div:last-child{background:#183127;border-color:#447962;}
    .netref26-annual small{display:block;color:#c7d8e8;font-weight:650;font-size:.73rem;line-height:1.35;}
    .netref26-annual strong{display:block;color:#d0e7ff;font-size:clamp(1.17rem,4.6vw,1.58rem);font-weight:850;letter-spacing:-.035em;white-space:nowrap;margin-top:6px;font-variant-numeric:tabular-nums;}
    .netref26-annual>div:last-child strong{color:#a9ffd2;}
    .netref26-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px;}
    .netref26-cards>div{background:#293644;border:1px solid #43627b;border-radius:12px;padding:11px 10px;min-width:0;}
    .netref26-cards>div:first-child{background:#243d35;border-color:#49886d;}
    .netref26-cards small{display:block;font-size:.70rem;color:#d3dfed;line-height:1.4;}
    .netref26-cards strong{display:block;font-size:clamp(1.16rem,4.2vw,1.55rem);color:#f3fbff;margin-top:6px;font-variant-numeric:tabular-nums;white-space:nowrap;}
    .netref26-cards>div:first-child strong{color:#acffd6;}
    .netref26-summary{font-size:.78rem;line-height:1.5;margin:11px 0;color:#c7d4e4;}
    .netref26-option{display:flex;gap:8px;align-items:start;color:#d7e4ed;font-size:.78rem;line-height:1.45;padding:8px 0;}
    .netref26-option input{margin-top:2px;accent-color:#72dfae;flex:none;}
    .netref26-overtime{background:#29333d;border-left:3px solid #78bbff;padding:10px 12px;border-radius:8px;margin:8px 0;display:grid;gap:6px;}
    .netref26-overtime[hidden]{display:none;}
    .netref26-overtime strong{font-size:.86rem;color:#b8dbff;}
    .netref26-overtime span{font-size:.78rem;line-height:1.5;color:#d5e4ed;}
    .netref26-yearnote{font-size:.74rem;color:#ffd9a0;line-height:1.42;margin:7px 0;}
    .netref26-source{border-top:1px solid #435467;margin-top:12px;padding-top:9px;}
    .netref26-source summary{cursor:pointer;color:#a9d6ff;font-size:.79rem;font-weight:750;}
    .netref26-source p{font-size:.75rem;line-height:1.55;color:#c9d8e6;}
    .netref26-source a{color:#a6d0ff;}
    @media(max-width:350px){.netref26-head h2{font-size:.98rem}.netref26-head span{font-size:.66rem}.netref26-cards strong,.netref26-annual strong{font-size:1.07rem;}}
  `;
  document.head.append(css);
  history.insertAdjacentElement("afterend",host);

  const put=(id,value)=>{document.getElementById(id).textContent=value;};
  const resetAnnual=()=>{put("netref26GrossAnnual","–");put("netref26NetAnnual","–");put("netref26Monthly","–");put("netref26Fortnight","–");};
  const update=()=>{
    const base=readFinite("baseGross"),raise=readFinite("raise"),raiseMonth=readFinite("raiseMonth");
    const included=document.getElementById("netref26IncludeExtra").checked;
    const year=readFinite("planYear");
    const info=document.getElementById("netref26Overtime");
    const yearNote=year===REFERENCE_YEAR
      ? "Verovuoden 2026 yleinen vertailu, ei henkilökohtainen verokortti."
      : `Huom: suunnitteluvuosi ${year||"?"}. Tämä vertailu käyttää vain vuoden 2026 viitetasoa; se EI ennusta vuoden ${year||"?"} verotusta.`;
    put("netref26YearWarning",yearNote);
    if(!(base>0&&base<=1000000&&raise!=null&&raise>=0&&raise<=50&&
         raiseMonth!=null&&Number.isInteger(raiseMonth)&&raiseMonth>=1&&raiseMonth<=12)){
      resetAnnual();
      put("netref26Summary","Täytä perusansiot tai käytä hyväksyttyjä palkkahistorian ehdotuksia.");
      info.hidden=true;
      return;
    }
    const baseAfterRaise=base*(1+(raise/100)*(13-raiseMonth)/12);
    let extra=0;
    if(included){
      const fields=["holiday","bonus","other"].map(readFinite);
      if(fields.some(x=>x==null||x<0||x>1000000)){
        put("netref26Summary","Korjaa erikseen syötetyt lisät ennen vertailua.");
        resetAnnual();
        info.hidden=true;return;
      }
      extra=fields.reduce((a,b)=>a+b,0);
    }
    const annualGross=baseAfterRaise+extra;
    const annual=referenceNet2026(annualGross);
    if(!annual){
      resetAnnual();
      put("netref26Summary","Vuositulo on tämän kokeellisen 2026 viitemallin 20 000–140 000 € alueen ulkopuolella. Älä käytä arvausprosenttia.");
      info.hidden=true;return;
    }
    put("netref26GrossAnnual",eur(annualGross));
    put("netref26NetAnnual",eur(annual.net));
    put("netref26Monthly",eur(annual.net/12));
    put("netref26Fortnight",eur(annual.net/26));
    put("netref26Summary",`Verojen ja työntekijämaksujen arvioitu yhteisosuus ${pct(annual.effectiveAllInPercent)}. Ei verokortin perusprosentti. ${included?"Valitut lisät mukana.":"Lomarahat, bonukset ja muut erilliset tulot eivät ole mukana."}`);
    const addGross=getWeekendGross();
    if(!(addGross>0)){info.hidden=true;return;}
    const plus=referenceNet2026(annualGross+addGross);
    if(!plus){
      info.hidden=false;
      put("netref26OvertimeTitle","Ylityövertailu tämän viitetaulukon ulkopuolella");
      put("netref26OvertimeText","Lisätyön vuosiansio nostaa brutton viitemallin ylärajan yli. Ei keksittyä nettoarviota.");
      return;
    }
    info.hidden=false;
    const gain=plus.net-annual.net;
    const weekends=readFinite("weekends");
    put("netref26OvertimeTitle",`Valitut työviikonloput: ${weekends} kpl → nettoero +${eur(gain/12)}/kk`);
    put("netref26OvertimeText",`Lisäbrutto ${eur(addGross)}/vuosi → arvioitu lisänetto ${eur(gain)}/vuosi eli +${eur(gain/26)} kahden viikon jaksoa kohti. Tämä on koko vuoden keskiarvo, ei kyseisen ylityöpalkan nettopidätys.`);
  };
  document.addEventListener("input",update);
  document.addEventListener("change",update);
  document.addEventListener("click",()=>queueMicrotask(update));
  const observe=document.getElementById("histBase");
  if(observe)new MutationObserver(update).observe(observe,{subtree:true,childList:true,characterData:true});
  update();
}
if(typeof document!=="undefined"){
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountPreview,{once:true});
  else mountPreview();
}
