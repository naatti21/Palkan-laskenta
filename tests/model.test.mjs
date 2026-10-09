import test from "node:test";
import assert from "node:assert/strict";
import {
  applyUserCorrections,
  makeBackup,
  makeRecordFromParsed,
  migrateLegacyRecord,
  parseBackup,
  paymentState
} from "../model.js";
import { parsePayslip } from "../parser.js";
import { readFile } from "node:fs/promises";

test("legacy-data siirtyy kanoniseen malliin ilman tunnistetietoja", () => {
  const legacy = {
    payDate: "2025-12-31",
    grossPay: 3000,
    netPay: 1900,
    ytdTaxableIncome: 70000,
    employerName: "EI SAA TALLENTUA",
    employeeName: "EI SAA TALLENTUA",
    bankAccount: "FI00 0000 0000 0000 00",
    rawText: "henkilötietoja"
  };
  const record = migrateLegacyRecord(legacy);
  const json = JSON.stringify(record);
  assert.equal(record.taxYear, 2025);
  assert.equal(json.includes("EI SAA TALLENTUA"), false);
  assert.equal(json.includes("FI00"), false);
  assert.equal(json.includes("henkilötietoja"), false);
});

test("käyttäjän korjaus säilyttää parserin alkuperäisen arvon", async () => {
  const text = await readFile(new URL("./fixtures/variant-a.txt", import.meta.url), "utf8");
  const parsed = parsePayslip(text);
  const record = makeRecordFromParsed(parsed, "abc");
  const corrected = applyUserCorrections(record, { grossPay: 3213.01 });
  assert.equal(corrected.values.grossPay, 3213.01);
  assert.equal(corrected.corrections.grossPay.parserValue, 3212.79);
  assert.equal(corrected.corrections.grossPay.userValue, 3213.01);
  assert.equal(corrected.id, record.id);
});

test("varmuuskopio palautuu ilman PDF-raakatekstiä", async () => {
  const text = await readFile(new URL("./fixtures/variant-a.txt", import.meta.url), "utf8");
  const record = makeRecordFromParsed(parsePayslip(text), "abc");
  const backup = makeBackup([record]);
  const restored = parseBackup(backup);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].values.netPay, 1831.61);
  assert.equal("rawText" in restored[0], false);
});

test("tuleva oikea palkkalaskelma on vahvistettu tuleva eikä virhe", async () => {
  const text = await readFile(new URL("./fixtures/variant-a.txt", import.meta.url), "utf8");
  const record = makeRecordFromParsed(parsePayslip(text), "abc");
  assert.equal(paymentState(record, new Date("2026-10-01T12:00:00")), "confirmed_future");
  assert.equal(paymentState(record, new Date("2026-10-10T12:00:00")), "realized");
});


test("toinen käyttäjäkorjaus ei hukkaa parserin alkuperäistä arvoa", async () => {
  const text = await readFile(new URL("./fixtures/variant-a.txt", import.meta.url), "utf8");
  const original = makeRecordFromParsed(parsePayslip(text), "abc");
  const first = applyUserCorrections(original, { grossPay: 3213.01 });
  const second = applyUserCorrections(first, { grossPay: 3214.02 });
  assert.equal(second.corrections.grossPay.parserValue, 3212.79);
  assert.equal(second.corrections.grossPay.userValue, 3214.02);
  const reverted = applyUserCorrections(second, { grossPay: 3212.79 });
  assert.equal(reverted.corrections.grossPay, undefined);
});

test("nykyisen skeeman tuonnissa ylimääräinen henkilötietorakenne pudotetaan", () => {
  const input = {
    recordSchemaVersion: 1,
    id: "x",
    values: { payDate: "2026-01-02", grossPay: 1000, netPay: 700, ytdTaxableIncome: 1000 },
    personal: { name: "EI SAA SÄILYÄ", employer: "EI SAA SÄILYÄ" },
    rawText: "EI SAA SÄILYÄ",
    payLines: []
  };
  const record = migrateLegacyRecord(input);
  const json = JSON.stringify(record);
  assert.equal(json.includes("EI SAA SÄILYÄ"), false);
  assert.equal("personal" in record, false);
  assert.equal("rawText" in record, false);
});
