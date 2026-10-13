import {test} from "node:test";
import assert from "node:assert/strict";
import {collectTaxableEvidence,resolveTaxableEvidence} from "../semantic-evidence.js";
import {parsePayslip} from "../parser.js";
import {makeRecordFromParsed,migrateLegacyRecord} from "../model.js";

const common=[
  "PALKKALASKELMA",
  "Palkkakausi 1.11.2026 - 14.11.2026",
  "Maksupäivä 27.11.2026",
  "Maksetaan 2 100,00",
  "KERTYMÄ PALKKAKAUDELTA",
  "Ennakonpid. al. tul 3 500,00",
  "KERTYMÄ VUODEN ALUSTA",
  "Ennakonpid. al. tul 42 000,00"
].join("\n");

test("PDF-P0-03: all explicit YTD rows are compared regardless of order",()=>{
  for(const values of [["42 000,00","43 000,00"],["43 000,00","42 000,00"]]) {
    const parsed=parsePayslip(common+"\n"+values.map(x=>"Veronalainen YTD "+x).join("\n"));
    const ytd=parsed.fields.ytdTaxableIncome;
    assert.deepEqual([...ytd.candidates].sort((a,b)=>a-b),[42000,43000]);
    assert.equal(ytd.conflict,true);
    assert.equal(ytd.evidenceStatus,"conflict");
    assert.ok(parsed.notices.some(n=>n.level==="blocking"&&n.fields.includes("ytdTaxableIncome")));
    assert.equal(ytd.evidence.filter(e=>e.label==="explicit").length,2);
  }
});

test("equal source observations do not produce false positive",()=>{
  const parsed=parsePayslip(common+"\nVeronalainen YTD 42 000,00\nVeronalainen YTD 42 000,00");
  assert.equal(parsed.fields.ytdTaxableIncome.conflict,undefined);
  assert.equal(parsed.fields.ytdTaxableIncome.evidenceStatus,"verified");
  assert.equal(parsed.fields.ytdTaxableIncome.evidence.filter(x=>x.label==="explicit").length,2);
});

test("full period and YTD conflicts independently produce two blocking notices",()=>{
  const parsed=parsePayslip(common+"\nKauden tiedot\nVer.al.ans 3 600,00\n"+
    "Vuoden tiedot\nVer.al.ans 43 000,00");
  assert.equal(parsed.fields.grossPay.conflict,true);
  assert.equal(parsed.fields.ytdTaxableIncome.conflict,true);
  assert.ok(parsed.notices.some(n=>n.code==="gross-pay-conflict"));
  assert.ok(parsed.notices.some(n=>n.code==="ytd-taxable-conflict"));
});

test("minimized numeric source provenance survives record and migration without raw text",()=>{
  const parsed=parsePayslip(common+"\nVeronalainen YTD 42 000,00\nVeronalainen YTD 43 000,00");
  const saved=makeRecordFromParsed(parsed,"synthetic-fingerprint");
  const restored=migrateLegacyRecord(saved);
  assert.deepEqual(restored.fieldMeta.ytdTaxableIncome.evidence,saved.fieldMeta.ytdTaxableIncome.evidence);
  assert.equal(restored.fieldMeta.ytdTaxableIncome.evidenceStatus,"conflict");
  const json=JSON.stringify(restored.fieldMeta.ytdTaxableIncome.evidence);
  assert.equal(json.includes("PALKKALASKELMA"),false);
  assert.equal(json.includes("Maksupäivä"),false);
  assert.equal(json.includes("Veronalainen YTD"),false);
});

test("geometry maps to numeric candidate locations without storing label text",()=>{
  const text="Kauden tiedot\nVer.al.ans 3 500,00\nVer.al.ans 3 600,00";
  const found=collectTaxableEvidence(text,[{page:2,x:10,y:100},{page:2,x:20,y:80},{page:2,x:20,y:60}]);
  const answer=resolveTaxableEvidence("grossPay",found);
  assert.deepEqual(answer.candidates,[3500,3600]);
  assert.deepEqual(answer.observations.map(o=>[o.page,o.x,o.y]),[[2,20,80],[2,20,60]]);
});
