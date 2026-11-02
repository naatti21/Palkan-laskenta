import test from "node:test";
import assert from "node:assert/strict";
import { learnMappingsFromCorrections, applyLearnedMappings, mergeMappingUpdates } from "../learning.js";

// Entirely synthetic; exercises "teach once, then recognize" without storing source text.
const first = `PALKKALASKELMA
KAUDEN YHTEENVETO
Jakson veropohja 4 698,11
VUODEN YHTEENVETO
Kertyvä veropohja 63 832,82`;
const next = `PALKKALASKELMA
KAUDEN YHTEENVETO
Jakson veropohja 3 300,02
VUODEN YHTEENVETO
Kertyvä veropohja 67 132,84`;
const corrections = {
  grossPay: { parserValue: null, userValue: 4698.11 },
  ytdTaxableIncome: { parserValue: null, userValue: 63832.82 }
};

test("QA-learn-01: one explicit correction teaches the next slip's changed amounts", async () => {
  const map = await learnMappingsFromCorrections(first, corrections);
  assert.equal(map.length, 2);
  const found = await applyLearnedMappings(next, map);
  assert.deepEqual(found, { grossPay: 3300.02, ytdTaxableIncome: 67132.84 });
  assert.ok(map.every(entry => entry.confirmations === 1));
  const stored = JSON.stringify(map);
  assert.equal(stored.includes("Jakson veropohja"), false);
  assert.equal(stored.includes("Kertyvä veropohja"), false);
  assert.equal(stored.includes("4698"), false);
});

test("QA-learn-02: repeat training may reinforce existing matching selector, not require a second first-run lesson", async () => {
  const once = await learnMappingsFromCorrections(first, corrections);
  const nextCorrections = {
    grossPay: { parserValue: null, userValue: 3300.02 },
    ytdTaxableIncome: { parserValue: null, userValue: 67132.84 }
  };
  const twice = mergeMappingUpdates(once, await learnMappingsFromCorrections(next, nextCorrections));
  assert.equal(twice.length, 2);
  assert.ok(twice.every(x => x.confirmations === 2));
});

test("QA-learn-03: conflicting values under one learned heading must not be guessed", async () => {
  const once = await learnMappingsFromCorrections(first, corrections);
  const conflict = `PALKKALASKELMA
KAUDEN YHTEENVETO
Jakson veropohja 3 300,02
Jakson veropohja 3 900,02
VUODEN YHTEENVETO
Kertyvä veropohja 67 132,84`;
  const found = await applyLearnedMappings(conflict, once);
  assert.equal(found.grossPay, undefined);
  assert.equal(found.ytdTaxableIncome, 67132.84);
});

test("QA-learn-04: different layout headings cannot inherit an unrelated learned salary value", async () => {
  const once = await learnMappingsFromCorrections(first, corrections);
  const revised = `PALKKALASKELMA
KORVAUSYHTEENVETO
Jakson veropohja 3 300,02
KERTYMÄT UUDEN VUODEN ALUSTA
Kertyvä veropohja 67 132,84`;
  const found = await applyLearnedMappings(revised, once);
  assert.equal(found.grossPay, undefined);
  assert.equal(found.ytdTaxableIncome, undefined);
});

test("QA-learn-05: learning explicitly ignores personal-identity and bank-account labelled lines", async () => {
  const text = `PALKKALASKELMA
Henkilötunnus 010190-123A
Pankkitili FI00 1234 5600 0007 85
KAUDEN YHTEENVETO
Jakson veropohja 4 698,11`;
  const once = await learnMappingsFromCorrections(text, corrections);
  const raw = JSON.stringify(once);
  assert.equal(raw.includes("010190"), false);
  assert.equal(raw.includes("FI00"), false);
  assert.ok(once.every(m => m.selectors.every(s => /^[0-9a-f]{64}$/.test(s))));
});
