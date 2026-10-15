import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastTaxCardLimit } from '../taxcard-forecast.js';

const now = new Date('2026-10-15T12:00:00Z');
const row = (date, used, limit = 14000, rate = 21, extra = 41) => ({
  taxYear: 2026, kind: 'payslip',
  values: { payDate: date, taxCardAccumulatedIncome: used, taxLimit: limit, taxRate: rate, additionalRate: extra }
});
const sample = [
  row('2026-08-21', 5000), row('2026-09-04', 6500),
  row('2026-09-18', 8000), row('2026-10-02', 9500)
];

test('reports actual card usage, not YTD or an arbitrary annual goal', () => {
  const result = forecastTaxCardLimit(sample, 2026, now);
  assert.equal(result.valid, true);
  assert.equal(result.percent, 68);
  assert.equal(result.remaining, 4500);
  assert.match(result.estimate, /marrask|11\.2026/);
});

test('does not combine changed tax cards across the year', () => {
  const result = forecastTaxCardLimit([
    row('2026-08-21', 19000, 20000),
    row('2026-09-04', 2500, 14000),
    row('2026-09-18', 4000, 14000),
    row('2026-10-02', 5500, 14000)
  ], 2026, now);
  assert.equal(result.remaining, 8500);
  const justCurrentCard = forecastTaxCardLimit([
    row('2026-09-04', 2500, 14000), row('2026-09-18', 4000, 14000),
    row('2026-10-02', 5500, 14000)
  ], 2026, now);
  assert.equal(result.estimate, justCurrentCard.estimate);
});

test('missing limit and bad accumulation do not show a percentage', () => {
  assert.equal(forecastTaxCardLimit([row('2026-10-02', 9000, 0)], 2026, now).valid, false);
  assert.equal(forecastTaxCardLimit([row('2026-10-02', -100, 10000)], 2026, now).valid, false);
});

test('does not invent a payday when history is sparse or conflicting', () => {
  assert.match(forecastTaxCardLimit(sample.slice(-2), 2026, now).estimate, /lisää/);
  const duplicate = [...sample, row('2026-10-02', 9600)];
  assert.match(forecastTaxCardLimit(duplicate, 2026, now).estimate, /Useita/);
});

test('avoids projected dates for older years and stale snapshots', () => {
  assert.match(forecastTaxCardLimit(sample.map(r => ({ ...r, taxYear: 2025 })), 2025, now).estimate, /ei tehdä/);
  assert.match(forecastTaxCardLimit(sample, 2026, new Date('2026-12-20T12:00:00Z')).estimate, /tuoreen/);
});

test('shows reached limit without negative remaining', () => {
  const result = forecastTaxCardLimit([...sample, row('2026-10-16', 15000)], 2026, now);
  assert.equal(result.remaining, 0);
  assert.equal(result.percent, 107);
  assert.match(result.estimate, /saavutettu/);
});
