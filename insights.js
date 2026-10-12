// Deterministic, read-only salary insights. Source records are never modified.
// Payment-year observations and earned-period dates are intentionally separate.
const OVERTIME = new Set(["20040","20050","20060","20070","20080","1220","1230","1240"]);
const CATEGORIES = new Set(["overtime_100_daily","overtime_50_weekly","overtime_100_weekly","overtime_50","overtime_100"]);
const TIER = [
  ["20040", "100 % vrk"], ["20050", "50 % vko"], ["20060", "100 % vko"],
  ["20070", "TES 50 %"], ["20080", "TES 100 %"]
];
const MONTHS = ["tammi","helmi","maalis","huhti","touko","kesä","heinä","elo","syys","loka","marras","joulu"];
const number = n => typeof n === "number" && Number.isFinite(n) ? n : null;
const cents = n => number(n) == null ? null : Math.round(n * 100);
const decimal = n => Math.round(n * 100) / 100;
const sumCents = numbers => numbers.length && numbers.every(n => cents(n) != null)
  ? numbers.reduce((a,n)=>a + cents(n),0)/100 : null;
function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y,m,d] = s.split("-").map(Number);
  const x = new Date(Date.UTC(y,m-1,d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m-1 && x.getUTCDate() === d;
}
function payIdentity(record) {
  const v = record.values || {};
  return [v.payDate, v.payPeriodStart || "?", v.payPeriodEnd || "?"].join("|");
}
function safeRecords(records, year) {
  const all = (Array.isArray(records) ? records : [])
    .filter(r=>r && r.kind !== "forecast" && validDate(r.values?.payDate) &&
      Number(r.values.payDate.slice(0,4)) === year);
  const counts = new Map();
  for (const r of all) counts.set(payIdentity(r),(counts.get(payIdentity(r))||0)+1);
  const conflicts = all.filter(r=>counts.get(payIdentity(r))>1);
  const safe = all.filter(r=>counts.get(payIdentity(r))===1).sort((a,b)=>a.values.payDate.localeCompare(b.values.payDate));
  return {all,safe,conflicts};
}
function overtimeRows(record) {
  return (record.payLines || []).filter(row=>OVERTIME.has(String(row.code)) ||
    (CATEGORIES.has(row.category) && /^\d{4,6}$/.test(String(row.code || ""))));
}
function sumFields(records, field) {
  return sumCents(records.map(r=>r.values?.[field]));
}
function categories(records) {
  const result = TIER.map(([code,label])=>({code,label,hours:0,grossSupplement:0,rows:0,complete:true}));
  const byCode = new Map(result.map(c=>[c.code,c]));
  let explicitDocs=0, unknownDocs=0, moneyIncompleteDocs=0, lineCount=0;
  const allHours=[];
  const allAmounts=[];
  for(const r of records) {
    const rows = overtimeRows(r);
    if(rows.length) explicitDocs++;
    else if(number(r.values?.overtimeHours) == null) unknownDocs++;
    const rawSum = rows.reduce((a,row)=>a+(number(row.quantity)||0),0);
    const moneyComplete = rows.length && rows.every(row=>number(row.quantity)!=null && number(row.amount)!=null);
    if(rows.length && !moneyComplete) moneyIncompleteDocs++;
    if(rows.length && rows.every(row=>number(row.quantity)!=null)) allHours.push(decimal(rawSum));
    else if(!rows.length && number(r.values?.overtimeHours)!=null) allHours.push(r.values.overtimeHours);
    for(const row of rows) {
      lineCount++;
      allAmounts.push(number(row.amount));
      const tier=byCode.get(String(row.code));
      if(tier) {
        tier.rows++;
        if(number(row.quantity)!=null) tier.hours+=row.quantity;
        else tier.complete=false;
        if(number(row.amount)!=null) tier.grossSupplement+=cents(row.amount);
        else tier.complete=false;
      }
    }
  }
  return {
    explicitDocs, unknownDocs, moneyIncompleteDocs, lineCount,
    lineHourTotal: allHours.length === records.length && records.length ? decimal(allHours.reduce((a,b)=>a+b,0)) : null,
    recordedHourTotal: decimal(allHours.reduce((a,b)=>a+b,0)),
    hoursCoverage: allHours.length,
    moneyTotal: allAmounts.length && allAmounts.every(v=>v != null) ? sumCents(allAmounts) : null,
    hoursNotExclusive: true,
    tiers: result.filter(t=>t.rows).map(t=>({...t,hours:decimal(t.hours),grossSupplement:t.complete?t.grossSupplement/100:null}))
  };
}
function bank(records) {
  const use=records.map(r=>number(r.values?.worktimeBankUseHours)).filter(v=>v!=null);
  const add=records.map(r=>number(r.values?.worktimeBankAddHours)).filter(v=>v!=null);
  return {useUnits:decimal(use.reduce((s,v)=>s+v,0)),useDocs:use.length,addUnits:decimal(add.reduce((s,v)=>s+v,0)),addDocs:add.length,docs:records.length};
}
function paymentBreakdown(records) {
  const withholding = sumFields(records,"withholdingPeriod");
  const gross = sumFields(records,"grossPay");
  const net = sumFields(records,"netPay");
  // Only a reported deduction, never claim this is final taxation.
  return {gross,net,withholding:withholding==null?null:Math.abs(withholding),
    grossNetDifference:gross==null || net==null?null:decimal(gross-net),
    // Includes non-tax items and timing adjustments; do not name it mandatory social deductions.
    unexplainedDifference:gross==null || net==null || withholding==null?null:decimal(gross-net-Math.abs(withholding))};
}
function boundaries(records,year) {
  const periods = records.filter(r=>validDate(r.values?.payPeriodStart)&&validDate(r.values?.payPeriodEnd));
  const crossYear=periods.filter(r=>Number(r.values.payPeriodStart.slice(0,4)) !== year ||
    Number(r.values.payPeriodEnd.slice(0,4)) !== year);
  const dates=periods.flatMap(r=>[r.values.payPeriodStart,r.values.payPeriodEnd]);
  return {periodsAvailable:periods.length,recordsTotal:records.length,priorYearCrossings:crossYear.length,
    earliest:dates.length?[...dates].sort()[0]:null,
    latest:dates.length?[...dates].sort().at(-1):null,
    examples:crossYear.map(r=>({payDate:r.values.payDate,start:r.values.payPeriodStart,end:r.values.payPeriodEnd})),
    // Cannot split compensation by calendar day: pay amounts and hours may not accrue uniformly.
    allocatedEarningHours:null};
}
function monthMetrics(records,year) {
  return MONTHS.map((label,i)=>{
    const data=records.filter(r=>Number(r.values.payDate.slice(5,7))===i+1);
    const money=paymentBreakdown(data);
    const ot=categories(data);
    return {month:i+1,label,count:data.length,
      payDates:data.map(r=>r.values.payDate),...money,
      overtimeHours:ot.lineHourTotal, overtimeLineDocs:ot.explicitDocs,
      overtimeMoney:ot.moneyTotal};
  });
}
export function buildInsightReport(records,year) {
  if(!Number.isInteger(year)||year<1900||year>2200) throw new Error("Virheellinen vuosi");
  const {all,safe,conflicts}=safeRecords(records,year);
  const o=categories(safe), m=monthMetrics(safe,year);
  const gross=paymentBreakdown(safe);
  const last=safe.at(-1);
  return {
    year,totalRecords:all.length,excludedConflicts:conflicts.length,
    money:conflicts.length?{gross:null,net:null,withholding:null,grossNetDifference:null,unexplainedDifference:null}:gross,
    overtime: {...o,recordedHourTotal:conflicts.length?null:o.recordedHourTotal,
      lineHourTotal:conflicts.length?null:o.lineHourTotal,moneyTotal:conflicts.length?null:o.moneyTotal},
    bank:bank(safe),
    periods:boundaries(safe,year),
    months:m.map(mo=>conflicts.some(c=>Number(c.values.payDate.slice(5,7))===mo.month)
      ? {...mo,gross:null,net:null,withholding:null,grossNetDifference:null,unexplainedDifference:null,overtimeHours:null,overtimeMoney:null,hasConflict:true}
      : {...mo,hasConflict:false}),
    lastPayment:last?.values.payDate||null,
    ytd:last&&number(last.values?.ytdTaxableIncome)!=null?last.values.ytdTaxableIncome:null,
    lastTaxLimit:last&&number(last.values?.taxLimit)!=null?last.values.taxLimit:null,
    lastTaxCardAccumulated:last&&number(last.values?.taxCardAccumulatedIncome)!=null?last.values.taxCardAccumulatedIncome:null,
    // Bonuses may be listed alongside ordinary salary; indicative pay-line totals only.
    recognizedBonuses:sumCents(safe.flatMap(r=>(r.payLines||[])
      .filter(l=>["40000","40070"].includes(String(l.code))).map(l=>l.amount))) ,
    bonusRows:safe.flatMap(r=>(r.payLines||[])
      .filter(l=>["40000","40070"].includes(String(l.code)))).length
  };
}
export function buildBudget(netPay, needs=50,wants=30,savings=20) {
  if(number(netPay)==null || netPay<0 || [needs,wants,savings].some(n=>number(n)==null||n<0)
    || Math.abs(needs+wants+savings-100)>0.0001) return null;
  const total = cents(netPay);
  const need = Math.round(total*needs/100);
  const want = Math.round(total*wants/100);
  return {needs:need/100,wants:want/100,savings:(total-need-want)/100};
}
export function scenarioOvertime({grossSupplement,recordedHours,confirmedHours,retainedPct}) {
  if([grossSupplement,recordedHours,retainedPct].some(v=>number(v)==null)
      || grossSupplement<0||recordedHours<=0||retainedPct<0||retainedPct>100) return null;
  const estimatedNet=decimal(grossSupplement*retainedPct/100);
  const validHours=number(confirmedHours)!=null&&confirmedHours>0?confirmedHours:null;
  return {estimatedNet,perRecordedUnit:decimal(estimatedNet/recordedHours),
    perConfirmedHour:validHours?decimal(estimatedNet/validHours):null,
    confirmedHours:validHours,assumedRetention:retainedPct};
}
export function reverseNetGoal({targetNet,retainedPct}) {
  if(number(targetNet)==null||targetNet<0||number(retainedPct)==null||retainedPct<=0||retainedPct>100) return null;
  return decimal(targetNet/(retainedPct/100));
}
