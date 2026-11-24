import test from "node:test";
import assert from "node:assert/strict";
import { buildYearAnalysis } from "../analytics.js";

const r = (id, date, gross, net, overtime = null, extras = {}) => ({
  id, kind: "payslip",
  values: {
    payDate: date, payPeriodStart: extras.start || null, payPeriodEnd: extras.end || null,
    grossPay: gross, netPay: net, overtimeHours: overtime,
    ytdTaxableIncome: extras.ytd ?? null
  }
});

test("payment dates, not earned weeks, decide a calendar month's paid income", () => {
  const x = buildYearAnalysis([
    r("a", "2026-12-31", 1200.10, 800.05, 4, { start: "2026-12-15", end: "2026-12-28", ytd: 50000 }),
    r("b", "2027-01-15", 1300.15, 900.05, 3, { start: "2026-12-29", end: "2027-01-11", ytd: 1300.15 })
  ], 2026);
  assert.equal(x.payslips, 1);
  assert.equal(x.months[11].net, 800.05);
  assert.equal(x.months[0].net, null);
  assert.equal(x.totalGross, 1200.10);
});

test("months with no payslips are unknown, not zero earnings", () => {
  const x = buildYearAnalysis([r("a", "2026-10-09", 3212.79, 1831.61, 21.03)], 2026);
  assert.equal(x.months[0].net, null);
  assert.equal(x.months[9].net, 1831.61);
  assert.equal(x.months[9].complete, true);
});

test("two independent paydays in the same month add cent-exactly", () => {
  const x = buildYearAnalysis([
    r("a", "2026-10-09", 1999.99, 1234.56, 3),
    r("b", "2026-10-23", 2000.02, 1000.07, 2)
  ], 2026);
  assert.equal(x.months[9].gross, 4000.01);
  assert.equal(x.months[9].net, 2234.63);
  assert.equal(x.totalNet, 2234.63);
  assert.equal(x.overtime.knownHours, 5);
  assert.equal(x.overtime.complete, true);
});

test("unknown overtime never turns into claimed zero or complete year", () => {
  const x = buildYearAnalysis([
    r("a", "2026-06-01", 1100, 800, 2.5),
    r("b", "2026-06-12", 1200, 800, null)
  ], 2026);
  assert.equal(x.overtime.knownHours, 2.5);
  assert.equal(x.overtime.recordsWithHours, 1);
  assert.equal(x.overtime.recordsTotal, 2);
  assert.equal(x.overtime.complete, false);
});

test("duplicate same period is flagged and excluded from sum, not silently counted twice", () => {
  const x = buildYearAnalysis([
    r("a", "2026-10-09", 2000, 1200, 5, { start: "2026-09-21", end: "2026-10-04" }),
    r("b", "2026-10-09", 2100, 1300, 5, { start: "2026-09-21", end: "2026-10-04" }),
    r("c", "2026-10-23", 1000, 600, 1, { start: "2026-10-05", end: "2026-10-18" })
  ], 2026);
  assert.equal(x.conflictingRecords, 2);
  assert.equal(x.months[9].complete, false);
  assert.equal(x.months[9].net, null);
  assert.equal(x.totalNet, null);
  assert.equal(x.overtime.knownHours, 1);
  assert.equal(x.overtime.complete, false);
});

test("payslip with missing net is incomplete; value zero is different", () => {
  const missing = buildYearAnalysis([r("a", "2026-04-08", 100, null, 0)], 2026);
  assert.equal(missing.months[3].complete, false);
  assert.equal(missing.months[3].net, null);
  const actualZero = buildYearAnalysis([r("b", "2026-04-08", 100, 0, 0)], 2026);
  assert.equal(actualZero.months[3].net, 0);
  assert.equal(actualZero.months[3].complete, true);
  assert.equal(actualZero.overtime.complete, true);
});

test("YTD is the latest snapshot, not an addable period total", () => {
  const x = buildYearAnalysis([
    r("a", "2026-02-09", 1000, 800, 0, { ytd: 4000 }),
    r("b", "2026-02-23", 1200, 900, 1, { ytd: 5200 })
  ], 2026);
  assert.equal(x.latestYtd, 5200);
  assert.equal(x.totalGross, 2200);
});

test("future projections and adjacent tax years are not counted as earned payslips", () => {
  const forecast = r("f", "2026-12-01", 9000, 6500, 10);
  forecast.kind = "forecast";
  const x = buildYearAnalysis([forecast, r("next", "2027-01-01", 1000, 800, 4)], 2026);
  assert.equal(x.payslips, 0);
  assert.equal(x.latestYtd, null);
  assert.equal(x.totalGross, null);
  assert.equal(x.overtime.complete, false);
});

test("invalid pay dates and undefined list are treated safely", () => {
  const x = buildYearAnalysis([r("bad", "2026-02-30", 120, 100), r("ok", "2026-02-28", 200, 180)], 2026);
  assert.equal(x.payslips, 1);
  assert.equal(buildYearAnalysis(undefined, 2026).payslips, 0);
  assert.throws(() => buildYearAnalysis([], "2026"), /analyysivuosi/);
});

test("source records remain unchanged", () => {
  const items = [r("a", "2026-03-05", 1000, 700, null)];
  const original = JSON.stringify(items);
  buildYearAnalysis(items, 2026);
  assert.equal(JSON.stringify(items), original);
});


const deductibleLines=amounts=>["90100","90200","90400","90920"]
  .map((code,i)=>({code,label:"Synteettinen palkkavähennys",amount:amounts[i],quantity:1}));

test("latest four-code payroll evidence yields the same 10.16% as planner history",()=>{
  const old=r("old","2026-05-08",3000,2200,null);
  old.payLines=deductibleLines([-160,-65,-20,-10]);
  const match=r("match","2026-10-09",3000,2100,null);
  match.payLines=deductibleLines([-200,-75,-20,-9.8]);
  const newestIncomplete=r("newer","2026-10-23",3000,2100,null);
  newestIncomplete.payLines=deductibleLines([-200,-75,-20,null]);
  const nextYear=r("nextYear","2027-01-08",3000,2100,null);
  nextYear.payLines=deductibleLines([-300,-75,-20,-9.8]);
  const items=[old,match,newestIncomplete,nextYear];
  const snapshot=JSON.stringify(items);
  const analysis=buildYearAnalysis(items,2026);
  assert.deepEqual(analysis.deductions,{
    latestRate:10.16,latestPayDate:"2026-10-09",
    incomeSourceId:null,supportedPayslips:2,reviewedPayslips:3,
    blockedByConflicts:false
  });
  assert.equal(JSON.stringify(items),snapshot);
});

test("unavailable or ambiguous deductions stay unavailable instead of calculating gross-net gaps",()=>{
  const incomplete=r("missing","2026-04-01",3000,1800,null);
  incomplete.payLines=deductibleLines([-200,-80,-20,null]);
  assert.equal(buildYearAnalysis([incomplete],2026).deductions.latestRate,null);
  const invalid=r("invalid","2026-04-11",3000,1800,null);
  invalid.payLines=deductibleLines([-200,-80,-20,30]); // Positive amount cannot be a deduction.
  assert.equal(buildYearAnalysis([invalid],2026).deductions.latestRate,null);
  const unknownGross=r("unknown","2026-04-25",null,1800,null);
  unknownGross.payLines=deductibleLines([-200,-75,-20,-9.8]);
  assert.equal(buildYearAnalysis([unknownGross],2026).deductions.latestRate,null);
  const first=r("first","2026-10-09",3000,2000,null,{start:"2026-09-21",end:"2026-10-04"});
  first.payLines=deductibleLines([-200,-75,-20,-9.8]);
  const conflicting=r("conflict","2026-10-09",3100,2100,null,{start:"2026-09-21",end:"2026-10-04"});
  conflicting.payLines=deductibleLines([-200,-75,-20,-9.8]);
  const blocked=buildYearAnalysis([first,conflicting],2026).deductions;
  assert.equal(blocked.latestRate,null);
  assert.equal(blocked.blockedByConflicts,true);
});
