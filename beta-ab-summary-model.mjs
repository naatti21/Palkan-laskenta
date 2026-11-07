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


// A personal leisure value is required: the payroll series alone cannot define
// an objectively optimal amount of overtime. Prefer fewer weekends on ties.
export function optimalWeekendCount(series, card, freeWeekendValue) {
  if (!['A','B'].includes(card) ||
      !Number.isFinite(freeWeekendValue) || freeWeekendValue<0 || freeWeekendValue>100000 ||
      !Array.isArray(series) || series.length!==53 ||
      series.some((row,i)=>row.n!==i ||
        !Number.isFinite(row['net'+card]) ||
        !Number.isFinite(row.gross))) return null;
  const key='net'+card;
  const baseline=series[0][key];
  let best=0, bestUtility=0;
  for(let n=1;n<=52;n++){
    const utility=series[n][key]-baseline-n*freeWeekendValue;
    if(utility>bestUtility+0.005) {best=n;bestUtility=utility;}
  }
  return {
    n:best,
    free:52-best,
    gain:series[best][key]-baseline,
    totalNet:series[best][key],
    netPerLast:best?series[best][key]-series[best-1][key]:null,
    netPerNext:best<52?series[best+1][key]-series[best][key]:null,
    utility:bestUtility
  };
}
