import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePayslip, plainRecord } from "../parser.js";
import { classifyRecordRelation, makeRecordFromParsed } from "../model.js";
import { applyLearnedMappings, learnMappingsFromCorrections } from "../learning.js";

const REQUIRED = ["payDate", "grossPay", "netPay", "ytdTaxableIncome"];

function manualInterventions(parsed) {
  const fields = new Set();
  for (const key of REQUIRED) {
    const meta = parsed.fields?.[key];
    if (!meta || meta.value == null || Number(meta.confidence || 0) < 0.95) fields.add(key);
  }
  for (const notice of parsed.notices || []) {
    if (notice.level !== "blocking") continue;
    for (const key of notice.fields || []) fields.add(key);
  }
  return [...fields];
}

function assertGolden(parsed, expectedNet = 2678.39) {
  const r = plainRecord(parsed);
  assert.equal(parsed.documentType, "payslip");
  assert.deepEqual(manualInterventions(parsed), []);
  assert.equal(r.payPeriodStart, "2026-08-03");
  assert.equal(r.payPeriodEnd, "2026-08-16");
  assert.equal(r.payDate, "2026-08-28");
  assert.equal(r.grossPay, 4698.11);
  assert.equal(r.netPay, expectedNet);
  assert.equal(r.ytdTaxableIncome, 63832.82);
}

for (const [name, fixture] of [
  ["A moderni", "acceptance-a-modern.txt"],
  ["B kompakti", "test-format-b-compact.txt"],
  ["C vaihtoehtoinen sanasto", "acceptance-c-alt-terms.txt"]
]) {
  test(`${name}: ydinkentät hyväksytään ilman käyttäjäkysymyksiä`, async () => {
    const text = await readFile(new URL(`./fixtures/${fixture}`, import.meta.url), "utf8");
    const parsed = parsePayslip(text);
    assertGolden(parsed);
  });
}

test("ABCD-mittari: A/B/C tarvitsevat yhteensä 0 manuaalista ydinkenttää", async () => {
  let interventions = 0;
  for (const fixture of [
    "acceptance-a-modern.txt",
    "test-format-b-compact.txt",
    "acceptance-c-alt-terms.txt"
  ]) {
    const text = await readFile(new URL(`./fixtures/${fixture}`, import.meta.url), "utf8");
    interventions += manualInterventions(parsePayslip(text)).length;
  }
  assert.equal(interventions, 0);
});

test("D: sama palkka-aika eri luvuilla on ristiriita eikä hiljainen duplikaatti", async () => {
  const originalText = await readFile(new URL("./fixtures/acceptance-a-modern.txt", import.meta.url), "utf8");
  const changedText = await readFile(new URL("./fixtures/acceptance-d-conflict.txt", import.meta.url), "utf8");

  const originalParsed = parsePayslip(originalText);
  const changedParsed = parsePayslip(changedText);
  assertGolden(originalParsed);
  assertGolden(changedParsed, 2728.39);

  const original = makeRecordFromParsed(originalParsed, "acceptance-a");
  const changed = makeRecordFromParsed(changedParsed, "acceptance-d");
  const relation = classifyRecordRelation(original, changed);

  assert.equal(relation.type, "same_event_conflict");
  const keys = relation.differences.map(item => item.key);
  assert.ok(keys.includes("netPay"));
  assert.ok(keys.includes("withholdingPeriod"));
});

test("oppimisen roundtrip: kerran vahvistettu kenttä löytyy saman rakenteen seuraavasta laskelmasta", async () => {
  const first = `PALKKALASKELMA
Palkkakausi 3.8.2026 - 16.8.2026
Maksupäivä 28.8.2026
Maksetaan 2 678,39
KAUDEN YHTEENVETO
Jakson veropohja 4 698,11
VUODEN YHTEENVETO
Kertyvä veropohja 63 832,82`;

  const next = `PALKKALASKELMA
Palkkakausi 17.8.2026 - 30.8.2026
Maksupäivä 11.9.2026
Maksetaan 1 881,34
KAUDEN YHTEENVETO
Jakson veropohja 3 300,02
VUODEN YHTEENVETO
Kertyvä veropohja 67 132,84`;

  const mappings = await learnMappingsFromCorrections(first, {
    grossPay: { parserValue: null, userValue: 4698.11 },
    ytdTaxableIncome: { parserValue: null, userValue: 63832.82 }
  });
  const learned = await applyLearnedMappings(next, mappings);

  assert.equal(learned.grossPay, 3300.02);
  assert.equal(learned.ytdTaxableIncome, 67132.84);
});

test("oppiminen ei arvaa, jos sama opittu konteksti antaa kaksi eri arvoa", async () => {
  const first = `PALKKALASKELMA
KAUDEN YHTEENVETO
Jakson veropohja 4 698,11`;
  const ambiguous = `PALKKALASKELMA
KAUDEN YHTEENVETO
Jakson veropohja 3 300,02
Jakson veropohja 3 301,02`;

  const mappings = await learnMappingsFromCorrections(first, {
    grossPay: { parserValue: null, userValue: 4698.11 }
  });
  const learned = await applyLearnedMappings(ambiguous, mappings);
  assert.equal(learned.grossPay, undefined);
});
