// Payment-date analytics for already stored payslips.
// This module never changes source records or reconstructs work dates from pay dates.
const MONTHS = ["tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu"];

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cents(value) {
  const number = finiteNumber(value);
  return number === null ? null : Math.round(number * 100);
}

function isPayDate(value, year) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !value.startsWith(String(year) + "-")) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function identity(record) {
  const v = record.values || {};
  // Multiple records with the same payday and period can be legitimate conflicts.
  // Never silently count both versions as independent earnings.
  return [v.payDate, v.payPeriodStart || "?", v.payPeriodEnd || "?"].join("|");
}

function sumMoney(records, key) {
  if (!records.length || records.some(r => cents(r.values?.[key]) === null)) return null;
  return records.reduce((sum, r) => sum + cents(r.values[key]), 0) / 100;
}

function sumOvertime(records) {
  const known = records.filter(r => finiteNumber(r.values?.overtimeHours) !== null);
  return {
    knownHours: Math.round(known.reduce((sum, r) => sum + r.values.overtimeHours, 0) * 100) / 100,
    recordsWithHours: known.length,
    recordsTotal: records.length,
    complete: records.length > 0 && known.length === records.length
  };
}

export function buildYearAnalysis(records, year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error("Virheellinen analyysivuosi");
  const yearly = (Array.isArray(records) ? records : [])
    .filter(r => r && r.kind !== "forecast" && isPayDate(r.values?.payDate, year))
    .sort((a, b) => a.values.payDate.localeCompare(b.values.payDate));
  const duplicates = new Map();
  for (const r of yearly) duplicates.set(identity(r), (duplicates.get(identity(r)) || 0) + 1);
  const hasAmbiguous = r => duplicates.get(identity(r)) > 1;
  const clean = yearly.filter(r => !hasAmbiguous(r));
  const rejected = yearly.length - clean.length;

  const months = Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    const monthRecords = yearly.filter(r => Number(r.values.payDate.slice(5, 7)) === number);
    const validRecords = monthRecords.filter(r => !hasAmbiguous(r));
    const conflicts = monthRecords.length - validRecords.length;
    const gross = !conflicts ? sumMoney(validRecords, "grossPay") : null;
    const net = !conflicts ? sumMoney(validRecords, "netPay") : null;
    return {
      month: number,
      label: MONTHS[index],
      payslips: monthRecords.length,
      conflictingRecords: conflicts,
      gross,
      net,
      complete: monthRecords.length > 0 && !conflicts && gross !== null && net !== null
    };
  });
  const hours = sumOvertime(clean);
  const last = yearly.at(-1) || null;
  const totalGross = rejected ? null : sumMoney(clean, "grossPay");
  const totalNet = rejected ? null : sumMoney(clean, "netPay");
  return {
    year,
    payslips: yearly.length,
    conflictingRecords: rejected,
    totalGross,
    totalNet,
    // Snapshot from the newest payslip, NOT the sum of monthly/yearly YTD values.
    latestYtd: finiteNumber(last?.values?.ytdTaxableIncome),
    lastPaymentDate: last?.values?.payDate ?? null,
    overtime: {
      ...hours,
      // Missing observations and conflicting periods preclude a precise annual total.
      complete: hours.complete && !rejected,
      excludedConflicts: rejected
    },
    months
  };
}
