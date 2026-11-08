import test from "node:test";
import assert from "node:assert/strict";
import {
  migrateLegacyRecord, paycycleOverlapEvidence,
  classifyRecordRelation, projectPayroll
} from "../model.js";

function make(id, payDate, gross, ytd, source = "payer-a", period = ["2026-05-01", "2026-05-14"]) {
  return migrateLegacyRecord({
    id, recordSchemaVersion: 3, incomeSourceId: source,
    values: {
      payDate, payPeriodStart: period[0], payPeriodEnd: period[1],
      grossPay: gross, netPay: gross * 0.7, ytdTaxableIncome: ytd
    }
  });
}

test("pay-cycle transition: later YTD increase matches later taxable gross but both remain unresolved", () => {
  const first = make("pay-one", "2026-05-22", 1750, 14500);
  const later = make("pay-two", "2026-06-05", 2800, 17300);
  const evidence = paycycleOverlapEvidence(first, later);
  assert.deepEqual(evidence, {
    samePeriod: true, differentPayDates: true, sameKnownPayer: true,
    additiveYtdMatchesLaterGross: true,
    ytdIncrease: 2800, laterTaxableGross: 2800
  });
  assert.deepEqual(paycycleOverlapEvidence(later, first), evidence);
  assert.equal(classifyRecordRelation(first, later).type, "same_event_conflict");
  const projected = projectPayroll([first, later]);
  assert.equal(projected.active.length, 0);
  assert.equal(projected.unresolved.length, 2);
});

test("a mismatch, same date, or uncertain payer cannot trigger the strong YTD hint", () => {
  const earlier = make("first", "2026-05-22", 1750, 14500);
  assert.equal(paycycleOverlapEvidence(earlier, make("mismatch", "2026-06-05", 2800, 17500)).additiveYtdMatchesLaterGross, false);
  assert.equal(paycycleOverlapEvidence(earlier, make("unknown", "2026-06-05", 2800, 17300, null)).additiveYtdMatchesLaterGross, false);
  assert.equal(paycycleOverlapEvidence(earlier, make("different", "2026-06-05", 2800, 17300, "payer-b")).additiveYtdMatchesLaterGross, false);
  assert.equal(paycycleOverlapEvidence(earlier, make("same-day", "2026-05-22", 2800, 17300)).additiveYtdMatchesLaterGross, false);
  assert.equal(paycycleOverlapEvidence(earlier, make("other-period", "2026-06-05", 2800, 17300, "payer-a", ["2026-05-15", "2026-05-28"])).additiveYtdMatchesLaterGross, false);
  assert.equal(paycycleOverlapEvidence(earlier, make("missing-ytd", "2026-06-05", 2800, null)).additiveYtdMatchesLaterGross, false);
});
