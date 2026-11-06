import test from "node:test";
import assert from "node:assert/strict";
import { buildIncomeSourceDiagnostics } from "../analytics.js";
import { migrateLegacyRecord } from "../model.js";

function row(id, source, date, from, until, ytd, used, limit=65000) {
  return migrateLegacyRecord({
    recordSchemaVersion:3, id, incomeSourceId:source,
    values:{
      payDate:date,payPeriodStart:from,payPeriodEnd:until,
      grossPay:3200,netPay:2300,ytdTaxableIncome:ytd,
      taxCardAccumulatedIncome:used,taxLimit:limit
    }
  });
}

test("YTD diagnostics never join two payers or unknown payer snapshots",()=>{
  const rows=[
    row("a1","job-a","2026-06-05","2026-05-01","2026-05-14",6500,6400),
    row("a2","job-a","2026-06-19","2026-05-15","2026-05-28",9700,9600),
    row("b1","job-b","2026-06-06","2026-05-01","2026-05-14",7100,7050),
    row("unknown",null,"2026-07-01","2026-06-01","2026-06-14",5000,4800)
  ];
  const original=JSON.stringify(rows);
  const d=buildIncomeSourceDiagnostics(rows,2026);
  assert.equal(d.multipleSources,true);
  assert.equal(d.unspecifiedCount,1);
  assert.equal(d.sources.length,3);
  assert.equal(d.sources.find(s=>s.incomeSourceId==="job-a").ytdObservation,9700);
  assert.equal(d.sources.find(s=>s.incomeSourceId==="job-b").ytdObservation,7100);
  assert.equal(d.sources.find(s=>s.incomeSourceId===null).comparable,false);
  assert.ok(d.sources.find(s=>s.incomeSourceId===null).issues.includes("Tulolähde määrittämättä"));
  assert.equal("combinedYtd" in d,false);
  assert.equal(JSON.stringify(rows),original);
});

test("conflicts are called out per payer, not silently promoted to trusted tax progress",()=>{
  const rows=[
    row("a0","job-a","2026-03-06","2026-02-02","2026-02-15",4000,3800),
    row("a1","job-a","2026-04-02","2026-03-16","2026-03-29",9200,8800),
    row("a2","job-a","2026-04-17","2026-03-16","2026-03-29",9800,9400),
    row("b","job-b","2026-04-17","2026-03-16","2026-03-29",6200,6100)
  ];
  const d=buildIncomeSourceDiagnostics(rows,2026);
  const a=d.sources.find(s=>s.incomeSourceId==="job-a");
  const b=d.sources.find(s=>s.incomeSourceId==="job-b");
  assert.equal(d.conflictCount,2);
  assert.equal(a.unresolvedCount,2);
  assert.equal(a.lastPayDate,"2026-03-06");
  assert.equal(a.comparable,false);
  assert.ok(a.issues.some(v=>v.includes("ristiriitaista")));
  assert.equal(b.unresolvedCount,0);
  assert.equal(b.ytdObservation,6200);
});

test("missing tax-card fields are issues, never treated as a zero total",()=>{
  const d=buildIncomeSourceDiagnostics([
    row("one","job-a","2026-10-23","2026-10-01","2026-10-15",null,null,null)
  ],2026);
  const a=d.sources[0];
  assert.equal(a.ytdObservation,null);
  assert.equal(a.cardObservation,null);
  assert.equal(a.taxLimitObservation,null);
  assert.ok(a.issues.includes("Palkkalaskelman YTD puuttuu"));
  assert.ok(a.issues.includes("Verokortin kertymä puuttuu"));
  assert.ok(a.issues.includes("Verokortin tuloraja puuttuu"));
});
