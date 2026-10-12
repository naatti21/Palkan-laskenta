import test from "node:test";
import assert from "node:assert/strict";
import { buildInsightReport, buildBudget, scenarioOvertime, reverseNetGoal } from "../insights.js";

const record=(id,date,start,end,gross,net,otRows=[],other={})=>({
  id,kind:"payslip",
  values:{
    payDate:date,payPeriodStart:start,payPeriodEnd:end,
    grossPay:gross,netPay:net,overtimeHours:otRows.length?otRows.reduce((s,x)=>s+x.quantity,0):0,
    withholdingPeriod:other.tax??null,ytdTaxableIncome:other.ytd??null,
    worktimeBankUseHours:other.bankUse??null,worktimeBankAddHours:other.bankAdd??null,
    taxLimit:other.limit??null,taxCardAccumulatedIncome:other.cardYtd??null
  },
  payLines:[...otRows,...(other.bonus || [])]
});
const ot=(code,qty,eur)=>({code,label:"Palkkalaji",quantity:qty,amount:eur,category:{
  "20040":"overtime_100_daily","20050":"overtime_50_weekly",
  "20060":"overtime_100_weekly","20070":"overtime_50",
  "20080":"overtime_100"}[code]});

test("year starts with December 2025 work but January 2026 payment",()=>{
  const x=buildInsightReport([
    record("dec","2026-01-09","2025-12-22","2026-01-04",3343.07,2014.61,[ot("20040",3.13,75.09)]),
    record("jan","2026-01-23","2026-01-05","2026-01-18",3024.86,1830.35,[ot("20050",8,95.96)]),
    record("next","2027-01-08","2026-12-21","2027-01-03",3000,2000)
  ],2026);
  assert.equal(x.totalRecords,2);
  assert.equal(x.periods.earliest,"2025-12-22");
  assert.equal(x.periods.priorYearCrossings,1);
  assert.deepEqual(x.periods.examples,[{payDate:"2026-01-09",start:"2025-12-22",end:"2026-01-04"}]);
  assert.equal(x.periods.allocatedEarningHours,null);
  assert.equal(x.months[0].gross,6367.93);
  assert.equal(x.months[0].net,3844.96);
});

test("same earning period but different pay dates are independent bonus/pay events",()=>{
  const records=[
    record("salary","2026-04-02","2026-03-16","2026-03-29",3612.66,2186.03,[ot("20040",6.06,149.50)]),
    record("bonus","2026-04-17","2026-03-16","2026-03-29",5237,3168.91,[],{bonus:[
      {code:"40000",amount:4837,quantity:null},{code:"40070",amount:400,quantity:null}
    ]})
  ];
  const x=buildInsightReport(records,2026);
  assert.equal(x.excludedConflicts,0);
  assert.equal(x.months[3].net,5354.94);
  assert.equal(x.recognizedBonuses,5237);
  assert.equal(x.bonusRows,2);
  assert.equal(x.overtime.explicitDocs,1);
});

test("explicit overtime units can be summed without adding sunday and weekly rest twice",()=>{
  const x=buildInsightReport([record("a","2026-05-22","2026-05-01","2026-05-14",3115.7,1877.03,
    [ot("20040",1.86,45.74),ot("20070",8,98.36),ot("20080",8,196.72)],{bankUse:3.99,bankAdd:-1.12})],2026);
  assert.equal(x.overtime.recordedHourTotal,17.86);
  assert.equal(x.overtime.moneyTotal,340.82);
  assert.equal(x.overtime.tiers.length,3);
  assert.equal(x.overtime.explicitDocs,1);
  assert.deepEqual(x.bank,{useUnits:3.99,useDocs:1,addUnits:-1.12,addDocs:1,docs:1});
});

test("stored zero does not prove there was an actual overtime line",()=>{
 const x=buildInsightReport([
  record("no","2026-03-06","2026-02-16","2026-03-01",889.88,530.17,[]),
  record("yes","2026-03-20","2026-03-02","2026-03-15",3659.21,2214.19,[ot("20060",7.08,174.66)])
 ],2026);
 assert.equal(x.overtime.recordedHourTotal,7.08);
 assert.equal(x.overtime.explicitDocs,1);
 assert.equal(x.overtime.hoursCoverage,2);
 assert.equal(x.overtime.unknownDocs,0);
});

test("missing overtime value and no pay rows is unknown, not zero",()=>{
 const x=record("no","2026-02-01","2026-01-15","2026-01-31",1000,750);
 x.values.overtimeHours=null;
 const y=buildInsightReport([x],2026);
 assert.equal(y.overtime.unknownDocs,1);
 assert.equal(y.overtime.lineHourTotal,null);
 assert.equal(y.overtime.recordedHourTotal,0);
});

test("withholding is separated from unexplained gross/net gap",()=>{
 const x=buildInsightReport([record("p","2026-06-05","2026-05-01","2026-05-15",3387.11,2049.54,[],{tax:-982.26})],2026);
 assert.deepEqual(x.money,{gross:3387.11,net:2049.54,withholding:982.26,grossNetDifference:1337.57,unexplainedDifference:355.31});
 assert.equal(x.lastTaxLimit,null);
});

test("missing source fields do not become fabricated zero-euro deductions",()=>{
 const a=record("p","2026-06-05","2026-05-01","2026-05-15",3387.11,2049.54);
 a.values.withholdingPeriod=null;
 const x=buildInsightReport([a],2026);
 assert.equal(x.money.withholding,null);
 assert.equal(x.money.unexplainedDifference,null);
 assert.equal(x.months[0].gross,null);
});

test("conflicting duplicate events block totals; other month remains valid",()=>{
 const a=record("a","2026-04-02","2026-03-16","2026-03-29",3600,2000,[ot("20060",8,200)]);
 const b=record("b","2026-04-02","2026-03-16","2026-03-29",3700,2200,[ot("20060",8,220)]);
 const c=record("c","2026-05-08","2026-04-13","2026-04-26",3000,1900,[ot("20040",2,40)]);
 const x=buildInsightReport([a,b,c],2026);
 assert.equal(x.excludedConflicts,2);
 assert.equal(x.money.net,null);
 assert.equal(x.overtime.recordedHourTotal,null);
 assert.equal(x.months[3].net,null);
 assert.equal(x.months[4].net,1900);
});

test("invalid payment dates and forecast do not pollute payroll totals",()=>{
 const a=record("invalid","2026-02-30","2026-02-01","2026-02-15",100,50);
 const b=record("forecast","2026-03-09","2026-02-16","2026-03-01",10000,7000);
 b.kind="forecast";
 assert.equal(buildInsightReport([a,b],2026).totalRecords,0);
});

test("50/30/20 cent-exact budget and invalid allocation",()=>{
 assert.deepEqual(buildBudget(1831.61),{needs:915.81,wants:549.48,savings:366.32});
 assert.equal(buildBudget(1831.61,60,30,30),null);
 assert.equal(buildBudget(-1),null);
});

test("reverse net goal and overtime scenario do not label inferred income as actual",()=>{
 assert.deepEqual(scenarioOvertime({grossSupplement:600,recordedHours:20,confirmedHours:null,retainedPct:60}),
 {estimatedNet:360,perRecordedUnit:18,perConfirmedHour:null,confirmedHours:null,assumedRetention:60});
 assert.equal(scenarioOvertime({grossSupplement:600,recordedHours:20,confirmedHours:18,retainedPct:60}).perConfirmedHour,20);
 assert.equal(scenarioOvertime({grossSupplement:600,recordedHours:20,retainedPct:108}),null);
 assert.equal(reverseNetGoal({targetNet:2100,retainedPct:70}),3000);
 assert.equal(reverseNetGoal({targetNet:2100,retainedPct:0}),null);
});

test("read-only analytics never modifies user's records or raw pay lines",()=>{
 const a=record("p","2026-01-09","2025-12-22","2026-01-04",3000,2100,[ot("20040",3,75)]);
 const snapshot=JSON.stringify(a);
 buildInsightReport([a],2026);
 assert.equal(JSON.stringify(a),snapshot);
});
