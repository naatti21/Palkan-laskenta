import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLearnedMappings,
  learnMappingsFromCorrections,
  mergeMappingUpdates,
  sanitizeMappings
} from "../learning.js";

const first = `PALKKAERITTELY
Palkkakausi 3.8.2026 - 16.8.2026
Maksupvm 28.8.2026
Maksetaan 2 678,39
Ver.al.ans 4 698,11
KAUDEN TIEDOT
Ver.al.ans 4 698,11
Maksetaan 2 678,39
VUODEN TIEDOT
Ver.al.ans 63 832,82
`;

const second = `PALKKAERITTELY
Palkkakausi 17.8.2026 - 30.8.2026
Maksupvm 11.9.2026
Maksetaan 1 881,34
Ver.al.ans 3 300,02
KAUDEN TIEDOT
Ver.al.ans 3 300,02
Maksetaan 1 881,34
VUODEN TIEDOT
Ver.al.ans 67 132,84
`;

test("käyttäjän vahvistuksesta opitaan vain hashatut kontekstivalitsimet", async () => {
  const mappings = await learnMappingsFromCorrections(first, {
    grossPay: { parserValue: null, userValue: 4698.11 },
    netPay: { parserValue: null, userValue: 2678.39 },
    ytdTaxableIncome: { parserValue: null, userValue: 63832.82 }
  });

  assert.equal(mappings.length, 3);
  for (const mapping of mappings) {
    assert.ok(mapping.selectors.length >= 1);
    assert.ok(mapping.selectors.every(selector => /^[a-f0-9]{64}$/.test(selector)));
  }

  const serialized = JSON.stringify(mappings);
  assert.equal(serialized.includes("Ver.al.ans"), false);
  assert.equal(serialized.includes("Maksetaan"), false);
  assert.equal(serialized.includes("4698"), false);
  assert.equal(serialized.includes("63832"), false);
});

test("saman rakenteen seuraavasta laskelmasta opitut kentät vaihtuvat uusiin arvoihin", async () => {
  const mappings = await learnMappingsFromCorrections(first, {
    grossPay: { parserValue: null, userValue: 4698.11 },
    netPay: { parserValue: null, userValue: 2678.39 },
    ytdTaxableIncome: { parserValue: null, userValue: 63832.82 }
  });

  const values = await applyLearnedMappings(second, mappings);
  assert.equal(values.grossPay, 3300.02);
  assert.equal(values.netPay, 1881.34);
  assert.equal(values.ytdTaxableIncome, 67132.84);
});

test("ristiriitainen sama konteksti ei arvaa kentän arvoa", async () => {
  const mappings = await learnMappingsFromCorrections(first, {
    grossPay: { parserValue: null, userValue: 4698.11 }
  });

  const ambiguous = `PALKKAERITTELY
Ver.al.ans 3 000,00
Ver.al.ans 4 000,00
`;
  const values = await applyLearnedMappings(ambiguous, mappings);
  assert.equal(values.grossPay, undefined);
});

test("uusi vahvistus kasvattaa mappingin luottamusta vain kun selector osuu samaan rakenteeseen", async () => {
  const firstMap = await learnMappingsFromCorrections(first, {
    netPay: { parserValue: null, userValue: 2678.39 }
  });
  const secondMap = await learnMappingsFromCorrections(second, {
    netPay: { parserValue: null, userValue: 1881.34 }
  });

  const merged = mergeMappingUpdates(firstMap, secondMap);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].field, "netPay");
  assert.equal(merged[0].confirmations, 2);
});

test("mapping-sanitointi pudottaa raakatekstin ja kelvottomat selectorit", () => {
  const safe = sanitizeMappings([
    {
      field: "grossPay",
      selectors: ["not-a-hash", "a".repeat(64)],
      confirmations: 4,
      rawText: "EI SAA SÄILYÄ",
      label: "EI SAA SÄILYÄ"
    }
  ]);

  assert.equal(safe.length, 1);
  assert.deepEqual(safe[0].selectors, ["a".repeat(64)]);
  assert.equal(JSON.stringify(safe).includes("EI SAA SÄILYÄ"), false);
});
