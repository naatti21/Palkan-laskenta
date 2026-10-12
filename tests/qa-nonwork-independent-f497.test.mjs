// Adversarial QA oracles, test-only. Locked target application parent: f4972265.
import test from "node:test";
import assert from "node:assert/strict";
import {parsePayslip} from "../parser.js";
const header=[
 "PALKKALASKELMA",
 "Palkkakausi 1.11.2026 - 14.11.2026",
 "Maksupäivä 27.11.2026",
 "Maksetaan 2 100,00",
 "77777 QA-erikoislisä 2,00 60,00 120,00",
 "KERTYMÄ EDELLISELTÄ VUODELTA KERTYMÄ PALKKAKAUDELTA KERTYMÄ VUODEN ALUSTA",
 "Ennakonpid. al. tul 55 000,00 Ennakonpid. al. tul 3 500,00 Ennakonpid. al. tul 42 000,00",
 "Ennakonpidätys -13 750,00 Ennakonpidätys -875,00 Ennakonpidätys -10 500,00"
];
const parse=(...lines)=>parsePayslip([...header,...lines].join("\n"));
const blocked=(p,field)=>p.notices.some(n=>n.level==="blocking"&&n.fields?.includes(field));
const mustBlock=(p,field,values)=>{
 assert.equal(p.fields[field].conflict,true,field+": missing conflict");
 assert.ok(blocked(p,field),field+": missing blocking notice");
 assert.ok(p.fields[field].confidence<.95,field+": unsafe high confidence");
 for(const value of values)assert.ok(p.fields[field].candidates?.includes(value),field+": lost "+value);
};
test("metamorphic: independent second conflicting pay-period observation cannot be auto-accepted",()=>{
 const clean=parse("Kauden tiedot","Ver.al.ans 3 500,00");
 assert.equal(blocked(clean,"grossPay"),false);
 const variants=[
  ["Kauden tiedot","Ver.al.ans 3 500,00","Ver.al.ans 3 600,00"],
  ["Kauden tiedot","Ver.al.ans 3 600,00","Ver.al.ans 3 500,00"],
  ["Kauden tiedot","Ver.al.ans 3 500,00","Ver.al.ans 3 700,00","Ver.al.ans 3 600,00"],
  ["Kauden tiedot","Ver.al.ans 3 500,00","Vuoden tiedot","Ver.al.ans 42 000,00","Kauden tiedot","Ver.al.ans 3 600,00"],
  ["KAUDEN TIEDOT","VER.AL.ANS 3 500,00","Ver.al.ans 3 600,00"]
 ];
 for(const lines of variants){
  const p=parse(...lines);mustBlock(p,"grossPay",[3500,3600]);
  assert.equal(p.fields.ytdTaxableIncome.value,42000);
 }
});
test("metamorphic: conflicting YTD after mixed section orders cannot be auto-accepted",()=>{
 const variants=[
  ["Vuoden tiedot","Ver.al.ans 42 000,00","Ver.al.ans 43 000,00"],
  ["Vuoden tiedot","Ver.al.ans 43 000,00","Ver.al.ans 42 000,00"],
  ["Kauden tiedot","Ver.al.ans 3 500,00","Vuoden tiedot","Ver.al.ans 42 000,00","Ver.al.ans 43 000,00"],
  ["Vuoden tiedot","Ver.al.ans 42 000,00","Kauden tiedot","Ver.al.ans 3 500,00","Vuoden tiedot","Ver.al.ans 43 000,00"]
 ];
 for(const lines of variants){
  const p=parse(...lines);
  mustBlock(p,"ytdTaxableIncome",[42000,43000]);
  assert.equal(p.fields.grossPay.value,3500);
  assert.equal(blocked(p,"grossPay"),false);
 }
});
test("two simultaneous conflicts each retain BOTH semantic oracles",()=>{
 const p=parse("Kauden tiedot","Ver.al.ans 3 500,00","Ver.al.ans 3 600,00",
 "Vuoden tiedot","Ver.al.ans 42 000,00","Ver.al.ans 43 000,00");
 mustBlock(p,"grossPay",[3500,3600]);
 mustBlock(p,"ytdTaxableIncome",[42000,43000]);
 assert.equal(p.fields.previousYearTaxableIncome.value,55000);
});
test("repeating equal evidence is safe and does not invent conflicts",()=>{
 const p=parse("Kauden tiedot","Ver.al.ans 3 500,00","Ver.al.ans 3 500,00",
 "Vuoden tiedot","Ver.al.ans 42 000,00","Ver.al.ans 42 000,00");
 assert.equal(blocked(p,"grossPay"),false);
 assert.equal(blocked(p,"ytdTaxableIncome"),false);
 assert.equal(p.fields.grossPay.value,3500);
 assert.equal(p.fields.ytdTaxableIncome.value,42000);
});
test("distinct period/year/previous-year values must remain assigned to distinct fields",()=>{
 const p=parse("Kauden tiedot","Ver.al.ans 3 500,00",
 "Vuoden tiedot","Ver.al.ans 42 000,00");
 assert.equal(blocked(p,"grossPay"),false);
 assert.equal(blocked(p,"ytdTaxableIncome"),false);
 assert.equal(p.fields.previousYearTaxableIncome.value,55000);
 assert.equal(p.fields.grossPay.value,3500);
 assert.equal(p.fields.ytdTaxableIncome.value,42000);
});
