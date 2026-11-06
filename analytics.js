import { projectPayroll, incomeScope } from "./model.js";
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
  const projection = projectPayroll(Array.isArray(records) ? records : []);
  const yearly = projection.visible
    .filter(r => r && r.kind !== "forecast" && isPayDate(r.values?.payDate, year))
    .sort((a, b) => a.values.payDate.localeCompare(b.values.payDate));
  const hasAmbiguous = r => projection.unresolved.includes(r);
  const clean = yearly.filter(r => !hasAmbiguous(r));
  const unknownDate = projection.unresolved.some(r => !r.values?.payDate);
  const rejected = yearly.length - clean.length + (unknownDate ? 1 : 0);

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
    sourceSnapshots: clean.map(r => ({incomeSourceId: r.incomeSourceId || null, taxCardId: r.taxCardId || null,
      recordId: r.id, payDate: r.values.payDate, ytd: finiteNumber(r.values.ytdTaxableIncome),
      cardAccumulated: finiteNumber(r.values.taxCardAccumulatedIncome), limit: finiteNumber(r.values.taxLimit)})),
    sourceScope: incomeScope(yearly),
    latestYtd: rejected || incomeScope(yearly).multiple || yearly.filter(r => r.values.payDate === last?.values.payDate).length > 1 ? null : finiteNumber(last?.values?.ytdTaxableIncome),
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


/**
 * Source-level evidence only. Payroll-system YTD values are snapshots rather
 * than amounts to sum, and they never certify a multi-employer tax-card total.
 * No records are changed and no extrapolation from partial history is made.
 */
export function buildIncomeSourceDiagnostics(records, year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200)
    throw new Error("Virheellinen analyysivuosi");
  const projection = projectPayroll(Array.isArray(records) ? records : []);
  const visible = projection.visible.filter(r => r.kind !== "forecast" &&
    r.taxYear === year);
  const groups = new Map();
  for (const row of visible) {
    const id = row.incomeSourceId || null;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  const sources = [];
  for (const [incomeSourceId, rows] of groups) {
    const sorted = [...rows].sort((a,b) => String(a.values?.payDate || "")
      .localeCompare(String(b.values?.payDate || "")));
    const active = sorted.filter(row => projection.active.includes(row));
    const latest = active.at(-1) || null;
    const unresolvedCount = rows.filter(row => projection.unresolved.includes(row)).length;
    const issues = [];
    if (!incomeSourceId) issues.push("Tulolähde määrittämättä");
    if (unresolvedCount) issues.push(unresolvedCount + " ristiriitaista maksutietuetta");
    if (!latest) issues.push("Ei vahvistettua maksua");
    if (latest) {
      if (finiteNumber(latest.values?.ytdTaxableIncome) === null)
        issues.push("Palkkalaskelman YTD puuttuu");
      if (finiteNumber(latest.values?.taxCardAccumulatedIncome) === null)
        issues.push("Verokortin kertymä puuttuu");
      if (finiteNumber(latest.values?.taxLimit) === null)
        issues.push("Verokortin tuloraja puuttuu");
      if (active.filter(r => r.values?.payDate === latest.values?.payDate).length > 1)
        issues.push("Samana päivänä useita kertymähavaintoja");
    }
    const cards = new Set(active.map(r => r.taxCardId).filter(Boolean));
    if (cards.size > 1) issues.push("Vuoden aikana useita verokorttitunnisteita");
    sources.push({
      incomeSourceId, recordCount: rows.length, confirmedCount: active.length,
      unresolvedCount, lastPayDate: latest?.values?.payDate ?? null,
      ytdObservation: latest ? finiteNumber(latest.values?.ytdTaxableIncome) : null,
      cardObservation: latest ? finiteNumber(latest.values?.taxCardAccumulatedIncome) : null,
      taxLimitObservation: latest ? finiteNumber(latest.values?.taxLimit) : null,
      issues,
      comparable: Boolean(incomeSourceId && latest && !unresolvedCount &&
        !issues.includes("Samana päivänä useita kertymähavaintoja"))
    });
  }
  const conflictCount = visible.filter(r => projection.unresolved.includes(r)).length;
  const unspecifiedCount = visible.filter(r => !r.incomeSourceId).length;
  return {
    year, recordCount: visible.length, conflictCount, unspecifiedCount,
    multipleSources: new Set(visible.map(r => r.incomeSourceId).filter(Boolean)).size > 1,
    sources
  };
}
