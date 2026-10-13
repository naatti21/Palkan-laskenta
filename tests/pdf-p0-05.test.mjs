import {test} from "node:test";
import assert from "node:assert/strict";
import {parsePayslip} from "../parser.js";

// Synthetic two-page-equivalent text, same semantic pay period on both pages.
// Page two deliberately retains a YTD heading but loses the other two headings.
const prefix=[
  "PALKKALASKELMA",
  "Palkkakausi 1.11.2026 - 14.11.2026",
  "Maksupäivä 27.11.2026",
  "Maksetaan 2 100,00",
  "KERTYMÄ EDELLISELTÄ VUODELTA KERTYMÄ PALKKAKAUDELTA KERTYMÄ VUODEN ALUSTA",
  "Ennakonpid. al. tul 55 000,00 Ennakonpid. al. tul 3 500,00 Ennakonpid. al. tul 42 000,00",
  "Ennakonpidätys -13 750,00 Ennakonpidätys -875,00 Ennakonpidätys -10 500,00",
  ...Array.from({length:26},(_,i)=>"QA neutraali huomautus "+i),
  "SAMAN PALKKAKAUDEN YHTEENVETO - JATKO",
  "Palkkakausi 1.11.2026 - 14.11.2026",
  "KERTYMÄ VUODEN ALUSTA"
];
const makeText=(amounts,withholding)=>
  [...prefix,"Ennakonpid. al. tul "+amounts.join(" Ennakonpid. al. tul "),
    "Ennakonpidätys "+withholding.join(" Ennakonpidätys ")].join("\n");

test("PDF-P0-05 RED: a recognized single YTD header over three cells must fail closed",()=>{
  const parsed=parsePayslip(makeText(
    ["43 000,00","3 500,00","55 000,00"],
    ["-10 500,00","-875,00","-13 750,00"]));
  const ytd=parsed.fields.ytdTaxableIncome;
  assert.equal(ytd.evidenceStatus,"unverified",
    "incomplete competing table cannot certify 42000 automatically");
  assert.equal(ytd.evidenceIssue,true);
  assert.ok(parsed.notices.some(n=>n.level==="blocking"&&n.fields.includes("ytdTaxableIncome")));
});

test("PDF-P0-05: unambiguous one-column second YTD 43k conflicts with first 42k",()=>{
  const parsed=parsePayslip(makeText(["43 000,00"],["-10 500,00"]));
  const ytd=parsed.fields.ytdTaxableIncome;
  assert.equal(ytd.evidenceStatus,"conflict");
  assert.deepEqual([...ytd.candidates].sort((a,b)=>a-b),[42000,43000]);
});

test("PDF-P0-05: one-column equal YTD remains verified without false conflict",()=>{
  const parsed=parsePayslip(makeText(["42 000,00"],["-10 500,00"]));
  const ytd=parsed.fields.ytdTaxableIncome;
  assert.equal(ytd.evidenceStatus,"verified");
  assert.notEqual(ytd.conflict,true);
  assert.equal(parsed.notices.some(n=>n.level==="blocking"),false);
});

test("PDF-P0-05: ordinary isolated single-column cumulative sections remain supported",()=>{
  const text=[
    "PALKKALASKELMA",
    "Palkkakausi 1.11.2026 - 14.11.2026",
    "Maksupäivä 27.11.2026",
    "Maksetaan 2 100,00",
    "KERTYMÄ PALKKAKAUDELTA",
    "Ennakonpid. al. tul 3 500,00",
    "KERTYMÄ VUODEN ALUSTA",
    "Ennakonpid. al. tul 42 000,00"
  ].join("\n");
  const parsed=parsePayslip(text);
  assert.equal(parsed.fields.grossPay.evidenceStatus,"verified");
  assert.equal(parsed.fields.ytdTaxableIncome.evidenceStatus,"verified");
  assert.equal(parsed.notices.some(n=>n.level==="blocking"),false);
});
