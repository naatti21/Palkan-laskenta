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


// C is a *withholding knee*, not a claim about the final tax optimum.
// Evaluate the better of the two complete card scenarios at each workload.
// Return the LAST weekend before the first meaningful fall in marginal take-home.
// No knee is a legitimate result; never invent an "optimal" number.
export function calculateTaxKnee(series, {rateA,rateB,extraA,extraB,otherDeductions}={}) {
  if(!Array.isArray(series)||series.length!==53 ||
    ![rateA,rateB,extraA,extraB,otherDeductions].every(v=>
      typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100) ||
    series.some((row,i)=>row?.n!==i ||
      !Number.isFinite(row.gross)||row.gross<0||
      !Number.isFinite(row.netA)||!Number.isFinite(row.netB)))return null;
  const grossPerWeekend=series[1].gross-series[0].gross;
  if(!(grossPerWeekend>0))return null;
  for(let n=2;n<=52;n++)
    if(Math.abs(series[n].gross-series[n-1].gross-grossPerWeekend)>.01)return null;

  const best=row=>row.netA>=row.netB
    ?{card:'A',net:row.netA}:{card:'B',net:row.netB};
  const start=best(series[0]);
  const rawStartRate=start.card==='A'?rateA:rateB;
  const initialFullRate=grossPerWeekend*(1-(rawStartRate+otherDeductions)/100);
  // First weekend may already cross the limit. Only compare actual losses,
  // never equate a higher annual total with a better marginal return.
  const firstGain=best(series[1]).net-start.net;
  const materialDrop=Math.max(1,grossPerWeekend*.01);
  let knee=initialFullRate-firstGain>=materialDrop?0:null;
  if(knee===null){
    let previous=firstGain;
    for(let n=2;n<=52;n++){
      const marginal=best(series[n]).net-best(series[n-1]).net;
      if(previous-marginal>=materialDrop){knee=n-1;break;}
      previous=marginal;
    }
  }
  if(knee===null)return {found:false,reason:'no-step'};
  const picked=best(series[knee]);
  const previousNet=knee?best(series[knee-1]).net:null;
  const nextNet=knee<52?best(series[knee+1]).net:null;
  return {
    found:true,n:knee,card:picked.card,gross:series[knee].gross,
    net:picked.net,free:52-knee,
    gainBefore:knee?picked.net-previousNet:initialFullRate,
    gainAfter:nextNet===null?null:nextNet-picked.net,
    stepAt:knee+1
  };
}
