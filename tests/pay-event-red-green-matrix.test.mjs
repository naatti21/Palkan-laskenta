/**
 * RED/GREEN event identity QA matrix — synthetic data only.
 *
 * Intentional RED tests below describe unresolved product requirements.
 * They run ONLY on the isolated diagnostic branch. DO NOT merge this file
 * as a green release gate until the event-identity design is implemented.
 *
 * A matching salary period or a matching amount is NOT, by itself, a
 * unique real-world payment identifier.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyUserCorrections, classifyRecordRelation, findRecordConflict,
  makeBackup, mergeRecords, migrateLegacyRecord, parseBackup
} from "../model.js";
import { buildYearAnalysis } from "../analytics.js";

const base = {
  payDate: "2026-08-28",
  payPeriodStart: "2026-08-03",
  payPeriodEnd: "2026-08-16",
  grossPay: 3000,
  netPay: 1900,
  ytdTaxableIncome: 40000,
  withholdingPeriod: -850
};
const make = (id, changes = {}, extra = {}) => migrateLegacyRecord({
  recordSchemaVersion: 1,
  id,
  values: { ...base, ...changes },
  fingerprints: [`fixture-${id}`],
  payLines: [],
  fieldMeta: {},
  corrections: {},
  notices: [],
  parser: { version: "qa", confidence: 1, documentType: "payslip", sourceProfile: "synthetic" },
  ...extra
});

// Known-safe behavior. These should stay GREEN as the model evolves.
test("GREEN E01: identical document does not create a new event", () => {
  const a = make("a");
  const copy = JSON.parse(JSON.stringify(a));
  assert.equal(classifyRecordRelation(a, copy).type, "exact_duplicate");
  assert.equal(findRecordConflict([a], copy), null);
});
test("GREEN E03: same payday and period but changed net needs manual conflict resolution", () => {
  const a = make("a");
  const b = make("b", { netPay: 1950 });
  const relation = classifyRecordRelation(a, b);
  assert.equal(relation.type, "same_event_conflict");
  assert.ok(relation.differences.some(x => x.key === "netPay"));
});
test("GREEN E04: identical gross/net/YTD cannot hide withholding conflict", () => {
  const relation = classifyRecordRelation(make("a"), make("b", { withholdingPeriod: -860 }));
  assert.equal(relation.type, "same_event_conflict");
  assert.deepEqual(relation.differences.map(x => x.key), ["withholdingPeriod"]);
});
test("GREEN E11: non-overlapping pay periods may share a pay date", () => {
  const a = make("a");
  const b = make("b", { payPeriodStart: "2026-08-17", payPeriodEnd: "2026-08-27" });
  assert.equal(classifyRecordRelation(a, b).type, "distinct");
});
test("GREEN E14: YTD is a snapshot, not a sum of annual YTD observations", () => {
  const a = make("a", { payDate: "2026-08-14", ytdTaxableIncome: 37000 });
  const b = make("b", { payDate: "2026-08-28", ytdTaxableIncome: 40000, payPeriodStart: "2026-08-17", payPeriodEnd: "2026-08-27" });
  const report = buildYearAnalysis([a,b], 2026);
  assert.equal(report.latestYtd, 40000);
  assert.equal(report.totalGross, 6000);
});
test("GREEN E15: December pay period paid in January belongs to January tax year", () => {
  const r = make("jan", { payPeriodStart: "2026-12-14", payPeriodEnd: "2026-12-27", payDate: "2027-01-08", ytdTaxableIncome: 3000 });
  assert.equal(r.taxYear, 2027);
  assert.equal(buildYearAnalysis([r], 2026).payslips, 0);
  assert.equal(buildYearAnalysis([r], 2027).payslips, 1);
});
test("GREEN E17: previously confirmed user correction survives later merge", () => {
  const a = make("a");
  const corrected = applyUserCorrections(a, { ytdTaxableIncome: 41000 });
  const merged = mergeRecords(corrected, make("b"));
  assert.equal(merged.values.ytdTaxableIncome, 41000);
  assert.equal(merged.corrections.ytdTaxableIncome?.userValue, 41000);
});
test("GREEN E18: a structured backup can retain separately saved conflicting revisions", () => {
  const a = make("a");
  const b = make("b", { netPay: 1950 });
  const rows = parseBackup(makeBackup([a,b]));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].values.netPay, 1900);
  assert.equal(rows[1].values.netPay, 1950);
});
test("GREEN E22: an unresolved same-key pair must not produce a confident annual total", () => {
  const report = buildYearAnalysis([make("a"), make("b", { netPay: 1950 })], 2026);
  assert.equal(report.conflictingRecords, 2);
  assert.equal(report.totalNet, null);
});

// RED: these expected behaviors require an explicit identity/resolution design.
// Each is a real product-safety gap, NOT a parser accuracy problem.
test("RED E06: user-confirmed distinct payment IDs must prevent silent collapse even when amounts match", () => {
  const a = { ...make("a"), payEventId: "distinct-payment-A", resolution: "confirmed-distinct" };
  const b = { ...make("b"), payEventId: "distinct-payment-B", resolution: "confirmed-distinct" };
  assert.notEqual(classifyRecordRelation(a,b).type, "exact_duplicate",
    "Two explicitly different payout IDs must not be deduplicated by amounts alone.");
});
test("RED E07: same pay period but changed pay date must be reviewed as a possible correction", () => {
  const a = make("a");
  const b = make("b", { payDate: "2026-08-31", netPay: 1950 });
  assert.notEqual(classifyRecordRelation(a,b).type, "distinct",
    "Changed payday does not prove this is a new payment.");
});
test("RED E09: changed pay-period boundary at the same payday must not bypass correction review", () => {
  const a = make("a");
  const b = make("b", { payPeriodEnd: "2026-08-17", netPay: 1950 });
  assert.notEqual(classifyRecordRelation(a,b).type, "distinct",
    "Corrected period dates can belong to one payment.");
});
test("RED E12: identical missing-period records with different explicit payout IDs must not be silently merged", () => {
  const dates = { payPeriodStart: null, payPeriodEnd: null };
  const a = { ...make("a", dates), payEventId: "payment-A" };
  const b = { ...make("b", dates), payEventId: "payment-B" };
  assert.notEqual(classifyRecordRelation(a,b).type, "exact_duplicate",
    "Missing period identifiers increase ambiguity; they do not prove equality.");
});
test("RED E20: superseded revision is excluded while corrected revision counts exactly once", () => {
  const old = { ...make("a"), resolution: "superseded", payEventId: "single-payment" };
  const corrected = { ...make("b", { netPay: 1950 }), resolution: "active", payEventId: "single-payment" };
  const report = buildYearAnalysis([old, corrected], 2026);
  assert.equal(report.totalNet, 1950, "The approved replacement alone is active earnings.");
  assert.equal(report.conflictingRecords, 0);
});
test("RED E21: two explicitly confirmed separate payments with the same period must count twice", () => {
  const a = { ...make("a"), resolution: "confirmed-distinct", payEventId: "payout-A", distinctFrom: ["payout-B"] };
  const b = { ...make("b", { grossPay: 2000, netPay: 1200 }), resolution: "confirmed-distinct", payEventId: "payout-B", distinctFrom: ["payout-A"] };
  const report = buildYearAnalysis([a,b], 2026);
  assert.equal(report.totalNet, 3100, "Two verified actual payments must both contribute.");
  assert.equal(report.totalGross, 5000);
  assert.equal(report.conflictingRecords, 0);
});
