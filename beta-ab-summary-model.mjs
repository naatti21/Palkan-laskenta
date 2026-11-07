// Pure adapter around the existing planner core. No DOM, storage or tax model.
export const SUMMARY_INPUT_FIELDS = Object.freeze([
  'weekends','sat','sun','baseGross','holiday','bonus','other',
  'raise','raiseMonth','weekendGross','hourlyRate','ktaRate','limitA','limitB',
  'rateA','rateB','extraA','extraB','otherDeductions'
]);

export function parseDisplayedEuro(text) {
  const original=text?.trim()||'';
  if(original==='–'||original==='')return null;
  const cleaned=original.replace(/[\s\u00a0\u202f€]/g,'').replace('−','-').replace(',','.');
  if(!/^-?\d+(?:\.\d+)?$/.test(cleaned))return null;
  const number=Number(cleaned);
  return Number.isFinite(number)?number:null;
}

export function parseWeekendCount(raw) {
  if(raw==null||String(raw).trim()==='')return null;
  const value=Number(raw);
  return Number.isInteger(value)&&value>=0&&value<=52?value:null;
}

export function summaryBreakdown(inputs, countA, countB, computePlan) {
  if(SUMMARY_INPUT_FIELDS.some(id=>!Number.isFinite(inputs[id])))return null;
  const a=parseWeekendCount(countA),b=parseWeekendCount(countB);
  const common=parseWeekendCount(inputs.weekends);
  if(a==null||b==null||common==null)return null;
  try {
    const computed=computePlan?.({...inputs,weekends:Math.max(common,a,b)});
    if(!computed)return null;
    return {computed,a,b,common,reference:computed.series[common],
      rowA:computed.series[a],rowB:computed.series[b]};
  } catch { return null; }
}

// Symmetric decomposition preserves the A-B gap without assigning the
// nonlinear interaction entirely to either workload or withholding.
export function cashFlowDifference(rowA,rowB) {
  return {
    withholdingPart:((rowA.netA-rowA.netB)+(rowB.netA-rowB.netB))/2,
    workloadPart:((rowA.netA-rowB.netA)+(rowA.netB-rowB.netB))/2
  };
}


// A/B tax-card assumptions are separate complete scenarios. Never splice their
// annual net values together at different workload counts to invent a C result.
// C identifies an observable withholding threshold, NOT an income-tax optimum.
export function calculateTaxKnee(series, {limitA,limitB,rateA,rateB,extraA,extraB,otherDeductions}={}) {
  if(!Array.isArray(series)||series.length!==53 ||
    ![limitA,limitB,rateA,rateB,extraA,extraB,otherDeductions].every(v=>
      typeof v==='number'&&Number.isFinite(v)&&v>=0) ||
    [rateA,rateB,extraA,extraB,otherDeductions].some(v=>v>100) ||
    [limitA,limitB].some(v=>v>1000000) ||
    series.some((row,i)=>row?.n!==i ||
      !Number.isFinite(row.gross)||row.gross<0||
      !Number.isFinite(row.netA)||!Number.isFinite(row.netB)))return null;
  const baseline=series[0].gross;
  const grossPerWeekend=series[1].gross-baseline;
  if(!(grossPerWeekend>0))return null;
  for(let n=2;n<=52;n++)if(Math.abs(series[n].gross-series[n-1].gross-grossPerWeekend)>.01)return null;

  const card=letter=>{
    const limit=letter==='A'?limitA:limitB;
    const baseRate=letter==='A'?rateA:rateB;
    const extraRate=letter==='A'?extraA:extraB;
    const netKey='net'+letter;
    const crossing=series.find(p=>p.gross>limit+.005)?.n??null;
    if(crossing===null)return {card:letter,found:false,reason:'no-crossing',limit,baseRate,extraRate};
    if(crossing===0)return {card:letter,found:false,reason:'already-over',limit,baseRate,extraRate};
    // A tax-card limit is not a penalty in final taxation. Only call it a
    // marginal "step" if the card's withholding rate actually rises.
    const knee=crossing-1;
    const before=knee?series[knee][netKey]-series[knee-1][netKey]
      :grossPerWeekend*(1-(baseRate+otherDeductions)/100);
    const after=series[crossing][netKey]-series[knee][netKey];
    if(extraRate<=baseRate||before-after<Math.max(.01,grossPerWeekend*.00001))
      return {card:letter,found:false,reason:'no-drop',limit,baseRate,extraRate,crossing};
    return {card:letter,found:true,n:knee,stepAt:crossing,limit,baseRate,extraRate,
      gross:series[knee].gross,nextGross:series[crossing].gross,net:series[knee][netKey],
      gainBefore:before,gainAfter:after,free:52-knee};
  };
  const cards={A:card('A'),B:card('B')};
  const steps=Object.values(cards).filter(x=>x.found)
    .sort((a,b)=>a.n-b.n || a.card.localeCompare(b.card));
  if(!steps.length)return {found:false,reason:'no-step',cards,baseline,grossPerWeekend};
  return {...steps[0],found:true,cards,baseline,grossPerWeekend,
    selectionReason:'first-card-threshold'};
}


// C's public reference is separate from A/B's withholding assumptions.
// It uses the year-specific published full-year NET reference only.
// Do not extrapolate missing income ranges or silently reuse another year.
export function referenceWeekendAnalysis(series, referenceNet, year, referenceYear=2026) {
  if(!Array.isArray(series)||series.length!==53||
    series.some((row,i)=>row?.n!==i||!Number.isFinite(row.gross))||
    typeof referenceNet!=='function')return null;
  // A future planning year may display the *last published year* strictly as
  // a labelled benchmark, never as that year's predicted or official taxation.
  if(!Number.isInteger(year)||year<2020||year>2100)return {available:false,reason:'year',year,referenceYear};
  const provisional=year!==referenceYear;
  const points=series.map(row=>{
    const result=referenceNet(row.gross);
    return {n:row.n,gross:row.gross,net:result?.net??null};
  });
  if(points.every(p=>p.net===null))return {available:false,reason:'range',year,referenceYear};
  const perWeekend=points[1].gross-points[0].gross;
  if(!(perWeekend>0))return {available:false,reason:'weekend-gross',year,referenceYear};
  const marginal=points.map((p,i)=>{
    const previous=points[i-1];
    const gain=i>0&&p.net!==null&&previous.net!==null?p.net-previous.net:null;
    return {...p,gain,retained:gain===null?null:100*gain/perWeekend};
  });
  // Find only a material (> 3 percentage points) fall in the public
  // curve's marginal net retention. Flat/high-tax segments have NO
  // uniquely optimal weekend count. Do not impose a fake recommendation.
  let knee=null;
  for(let i=2;i<marginal.length;i++){
    const before=marginal[i-1],after=marginal[i];
    if(before.retained===null||after.retained===null)continue;
    if(before.retained-after.retained>=3){
      knee={
        n:i-1,stepAt:i,
        beforeGain:before.gain,afterGain:after.gain,
        beforeRetained:before.retained,afterRetained:after.retained,
        gross:before.gross,net:before.net
      };
      break;
    }
  }
  return {available:true,referenceYear,planningYear:year,provisional,perWeekend,points:marginal,knee};
}
