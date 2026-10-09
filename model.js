export const RECORD_SCHEMA_VERSION = 1;
export const BACKUP_SCHEMA_VERSION = 2;

const LEARNED_SIGNAL_ALLOWLIST = new Set([
  "title:palkkalaskelma", "title:palkkaerittely",
  "label:palkkakausi", "label:maksupaiva",
  "section:kauden-tiedot", "section:vuoden-tiedot",
  "label:ver-al-ans", "label:ennakonpidatys", "label:tuloraja",
  "section:erittely"
]);

export const VALUE_KEYS = [
  "payPeriodStart", "payPeriodEnd", "payDate",
  "grossPay", "netPay", "ytdTaxableIncome", "previousYearTaxableIncome",
  "taxCardAccumulatedIncome", "withholdingPeriod", "withholdingYtd",
  "taxRate", "taxLimit", "additionalRate", "kta", "pp",
  "overtime100DailyHours", "overtime50WeeklyHours", "overtime100WeeklyHours",
  "overtimeHours", "overtimeCompensation", "sundayHours", "weeklyRestHours",
  "worktimeBankUseHours", "worktimeBankAddHours", "cashPay",
  "taxableBenefits", "taxExemptBenefits", "preTaxSalaryAdjustment"
];

function nowIso() {
  return new Date().toISOString();
}

function safeText(value, maxLength = 200) {
  if (value == null) return null;
  return String(value).slice(0, maxLength);
}

function taxYearFromDate(payDate) {
  if (!payDate || !/^\d{4}-\d{2}-\d{2}$/.test(payDate)) return null;
  return Number(payDate.slice(0, 4));
}

function stableNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return Number(value).toFixed(2);
}

function safeValues(input = {}) {
  return Object.fromEntries(VALUE_KEYS.map(key => [key, input?.[key] ?? null]));
}

function safeFieldMeta(input = {}) {
  const out = {};
  for (const key of VALUE_KEYS) {
    const meta = input?.[key];
    if (!meta || typeof meta !== "object") continue;
    out[key] = {
      confidence: Number.isFinite(Number(meta.confidence)) ? Number(meta.confidence) : 0,
      source: safeText(meta.source, 160)
    };
  }
  return out;
}

function safePayLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.slice(0, 500).map(line => ({
    code: safeText(line?.code, 20),
    label: safeText(line?.label, 160),
    category: safeText(line?.category, 80) || "unknown",
    quantity: line?.quantity ?? null,
    unitType: safeText(line?.unitType, 30),
    unitPrice: line?.unitPrice ?? null,
    amount: line?.amount ?? null
  })).filter(line => line.code || line.label);
}

function safeNotices(notices) {
  if (!Array.isArray(notices)) return [];
  return notices.slice(0, 100).map(notice => ({
    level: ["notice", "blocking"].includes(notice?.level) ? notice.level : "notice",
    code: safeText(notice?.code, 80) || "notice",
    message: safeText(notice?.message, 400) || "",
    fields: Array.isArray(notice?.fields) ? notice.fields.filter(key => VALUE_KEYS.includes(key)).slice(0, 20) : []
  }));
}


function safeLearnedProfiles(profiles) {
  if (!Array.isArray(profiles)) return [];
  return profiles.slice(0, 100).map(profile => {
    const signals = Array.isArray(profile?.signals)
      ? [...new Set(profile.signals.filter(value => typeof value === "string" && LEARNED_SIGNAL_ALLOWLIST.has(value)))].sort().slice(0, 30)
      : [];
    if (signals.length < 3) return null;
    return {
      id: safeText(profile?.id, 120) || signals.join("|"),
      signals,
      confirmations: Math.max(1, Math.min(999, Number(profile?.confirmations) || 1)),
      sourceProfile: safeText(profile?.sourceProfile, 80) || "learned-local",
      firstSeenAt: safeText(profile?.firstSeenAt, 40) || null,
      lastSeenAt: safeText(profile?.lastSeenAt, 40) || null
    };
  }).filter(Boolean);
}

function safeCorrections(corrections) {
  const out = {};
  if (!corrections || typeof corrections !== "object") return out;
  for (const key of VALUE_KEYS) {
    const correction = corrections[key];
    if (!correction || typeof correction !== "object") continue;
    out[key] = {
      parserValue: correction.parserValue ?? null,
      userValue: correction.userValue ?? null,
      correctedAt: safeText(correction.correctedAt, 40) || nowIso()
    };
  }
  return out;
}

function safeParser(parser = {}, fallback = {}) {
  return {
    version: safeText(parser.version ?? fallback.version ?? "legacy", 40),
    confidence: Number.isFinite(Number(parser.confidence ?? fallback.confidence)) ? Number(parser.confidence ?? fallback.confidence) : 0,
    documentType: safeText(parser.documentType ?? fallback.documentType ?? "payslip", 40),
    sourceProfile: safeText(parser.sourceProfile ?? fallback.sourceProfile ?? "legacy-localStorage", 80)
  };
}

export function duplicateKeyFromValues(values = {}, fingerprint = "") {
  const { payDate, payPeriodStart, payPeriodEnd, grossPay, netPay, ytdTaxableIncome } = values;
  if (payDate && grossPay != null && netPay != null) {
    return [
      "pay",
      payDate,
      payPeriodStart || "",
      payPeriodEnd || "",
      stableNumber(grossPay),
      stableNumber(netPay),
      stableNumber(ytdTaxableIncome)
    ].join("|");
  }
  return fingerprint ? `fp|${fingerprint}` : null;
}

export function recordIdFrom(values = {}, fingerprint = "") {
  const duplicateKey = duplicateKeyFromValues(values, fingerprint) || `manual|${Date.now()}`;
  return duplicateKey.replace(/[^a-zA-Z0-9:_|.-]/g, "_");
}

export function paymentState(record, referenceDate = new Date()) {
  if (record?.kind === "forecast") return "forecast";
  const payDate = record?.values?.payDate;
  if (!payDate) return "confirmed";
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(referenceDate);
  return payDate > todayIso ? "confirmed_future" : "realized";
}

export function makeRecordFromParsed(parsed, fingerprint = "") {
  const values = {};
  const fieldMeta = {};
  for (const key of VALUE_KEYS) {
    const meta = parsed.fields?.[key];
    values[key] = meta?.value ?? null;
    if (meta) fieldMeta[key] = { confidence: meta.confidence ?? 0, source: meta.source ?? null };
  }

  const safeValueMap = safeValues(values);
  const createdAt = nowIso();
  const duplicateKey = duplicateKeyFromValues(safeValueMap, fingerprint);
  return {
    recordSchemaVersion: RECORD_SCHEMA_VERSION,
    id: recordIdFrom(safeValueMap, fingerprint),
    kind: "payslip",
    taxYear: taxYearFromDate(safeValueMap.payDate),
    duplicateKey,
    fingerprints: fingerprint ? [fingerprint] : [],
    createdAt,
    updatedAt: createdAt,
    values: safeValueMap,
    fieldMeta: safeFieldMeta(fieldMeta),
    payLines: safePayLines(parsed.payLines),
    parser: safeParser({
      version: parsed.parserVersion,
      confidence: parsed.overallConfidence,
      documentType: parsed.documentType,
      sourceProfile: parsed.sourceProfile
    }),
    notices: safeNotices(parsed.notices),
    corrections: {}
  };
}

export function applyUserCorrections(record, editedValues = {}) {
  const copy = migrateLegacyRecord(record);
  if (!copy) throw new Error("Korjattava palkkatieto ei ole kelvollinen.");
  const correctedAt = nowIso();

  for (const [key, nextValue] of Object.entries(editedValues)) {
    if (!VALUE_KEYS.includes(key)) continue;
    const previous = copy.values[key] ?? null;
    if ((previous ?? null) === (nextValue ?? null)) continue;

    const originalParserValue = copy.corrections[key]?.parserValue ?? previous;
    copy.values[key] = nextValue ?? null;
    if ((originalParserValue ?? null) === (nextValue ?? null)) {
      delete copy.corrections[key];
    } else {
      copy.corrections[key] = {
        parserValue: originalParserValue,
        userValue: nextValue ?? null,
        correctedAt
      };
    }
  }

  copy.taxYear = taxYearFromDate(copy.values.payDate);
  copy.duplicateKey = duplicateKeyFromValues(copy.values, copy.fingerprints?.[0] || "");
  copy.updatedAt = correctedAt;
  return copy;
}

function pickNonNull(existing = {}, incoming = {}) {
  const out = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

export function mergeRecords(existingInput, incomingInput) {
  const existing = migrateLegacyRecord(existingInput);
  const incoming = migrateLegacyRecord(incomingInput);
  if (!existing) return incoming;
  if (!incoming) return existing;

  const existingCorrections = existing.corrections || {};
  const mergedValues = pickNonNull(existing.values, incoming.values);
  for (const [key, correction] of Object.entries(existingCorrections)) {
    if (correction && Object.prototype.hasOwnProperty.call(correction, "userValue")) {
      mergedValues[key] = correction.userValue;
    }
  }

  const mergedFingerprints = [...new Set([...(existing.fingerprints || []), ...(incoming.fingerprints || [])].filter(Boolean))];
  const useIncomingLines = (incoming.payLines?.length || 0) >= (existing.payLines?.length || 0);
  const updatedAt = nowIso();
  const duplicateKey = duplicateKeyFromValues(mergedValues, mergedFingerprints[0] || "");

  return migrateLegacyRecord({
    recordSchemaVersion: RECORD_SCHEMA_VERSION,
    id: existing.id || incoming.id || recordIdFrom(mergedValues, mergedFingerprints[0] || ""),
    kind: existing.kind || incoming.kind || "payslip",
    createdAt: existing.createdAt || incoming.createdAt || updatedAt,
    updatedAt,
    taxYear: taxYearFromDate(mergedValues.payDate),
    duplicateKey,
    fingerprints: mergedFingerprints,
    values: mergedValues,
    fieldMeta: { ...(existing.fieldMeta || {}), ...(incoming.fieldMeta || {}) },
    payLines: useIncomingLines ? incoming.payLines : existing.payLines,
    corrections: { ...(incoming.corrections || {}), ...existingCorrections },
    notices: incoming.notices?.length ? incoming.notices : existing.notices,
    parser: incoming.parser || existing.parser
  });
}

export function migrateLegacyRecord(input) {
  if (!input || typeof input !== "object") return null;

  if (input.recordSchemaVersion === RECORD_SCHEMA_VERSION && input.values) {
    const values = safeValues(input.values);
    const fingerprints = Array.isArray(input.fingerprints)
      ? input.fingerprints.filter(value => typeof value === "string" && value.length <= 128).slice(0, 20)
      : [];
    const createdAt = safeText(input.createdAt, 40) || nowIso();
    return {
      recordSchemaVersion: RECORD_SCHEMA_VERSION,
      id: safeText(input.id, 300) || recordIdFrom(values, fingerprints[0] || ""),
      kind: input.kind === "forecast" ? "forecast" : "payslip",
      taxYear: taxYearFromDate(values.payDate),
      duplicateKey: duplicateKeyFromValues(values, fingerprints[0] || ""),
      fingerprints,
      createdAt,
      updatedAt: safeText(input.updatedAt, 40) || createdAt,
      values,
      fieldMeta: safeFieldMeta(input.fieldMeta),
      payLines: safePayLines(input.payLines),
      parser: safeParser(input.parser),
      notices: safeNotices(input.notices),
      corrections: safeCorrections(input.corrections)
    };
  }

  const values = safeValues(input);
  const createdAt = safeText(input.savedAt, 40) || nowIso();
  return {
    recordSchemaVersion: RECORD_SCHEMA_VERSION,
    id: recordIdFrom(values, ""),
    kind: "payslip",
    taxYear: taxYearFromDate(values.payDate),
    duplicateKey: duplicateKeyFromValues(values, ""),
    fingerprints: [],
    createdAt,
    updatedAt: createdAt,
    values,
    fieldMeta: {},
    payLines: [],
    parser: safeParser({}, {
      version: input.parserVersion || "0.1.0",
      confidence: input.overallConfidence ?? 0,
      documentType: input.documentType || "payslip",
      sourceProfile: "legacy-localStorage"
    }),
    notices: Array.isArray(input.warnings)
      ? safeNotices(input.warnings.map(message => ({ level: "notice", code: "legacy-warning", message, fields: [] })))
      : [],
    corrections: {}
  };
}

export function makeBackup(records, options = {}) {
  return {
    app: "Palkka PWA",
    backupSchemaVersion: BACKUP_SCHEMA_VERSION,
    recordSchemaVersion: RECORD_SCHEMA_VERSION,
    exportedAt: nowIso(),
    privacy: "Backup contains structured salary data and non-identifying learned layout signals only. Original PDFs, filenames and raw extracted text are not included.",
    learnedProfiles: safeLearnedProfiles(options.learnedProfiles),
    records: records.map(record => migrateLegacyRecord(record)).filter(Boolean)
  };
}

export function parseBackup(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Varmuuskopio ei ole kelvollinen JSON-tiedosto.");
  const records = Array.isArray(payload) ? payload : payload.records;
  if (!Array.isArray(records)) throw new Error("Varmuuskopiosta ei löytynyt palkkatietoja.");
  return records.map(migrateLegacyRecord).filter(Boolean);
}


export function parseBackupLearnedProfiles(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return safeLearnedProfiles(payload.learnedProfiles);
}
