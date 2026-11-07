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
