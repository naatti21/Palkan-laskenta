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

const DATE_VALUE_KEYS = new Set(["payPeriodStart", "payPeriodEnd", "payDate"]);

function validIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function assertValueType(key, value, context) {
  if (value == null) return;
  if (DATE_VALUE_KEYS.has(key)) {
    if (!validIsoDate(value)) throw new Error(`${context}: ${key} ei ole kelvollinen ISO-päivä.`);
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context}: ${key} ei ole kelvollinen numero.`);
  }
}

function validateBackupRecordInput(input, index, allowLegacyFlat = false) {
  const context = `Varmuuskopion tietue ${index + 1}`;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${context} ei ole kelvollinen tietue.`);
  }

  const values = input.recordSchemaVersion === RECORD_SCHEMA_VERSION && input.values
    ? input.values
    : allowLegacyFlat ? input : null;

  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error(`${context}: values puuttuu tai ei ole kelvollinen.`);
  }
  if (!allowLegacyFlat && input.recordSchemaVersion !== RECORD_SCHEMA_VERSION) {
    throw new Error(`${context}: tietueskeemaa ei tueta.`);
  }

  for (const key of VALUE_KEYS) assertValueType(key, values[key], context);

  if (values.payPeriodStart && values.payPeriodEnd && values.payPeriodStart > values.payPeriodEnd) {
    throw new Error(`${context}: palkkakauden loppupäivä on ennen alkupäivää.`);
  }

  if (Array.isArray(input.payLines)) {
    for (const [lineIndex, line] of input.payLines.entries()) {
      if (!line || typeof line !== "object" || Array.isArray(line)) {
        throw new Error(`${context}: palkkarivi ${lineIndex + 1} ei ole kelvollinen.`);
      }
      for (const key of ["quantity", "unitPrice", "amount"]) {
        const value = line[key];
        if (value != null && (typeof value !== "number" || !Number.isFinite(value))) {
          throw new Error(`${context}: palkkarivin ${key} ei ole kelvollinen numero.`);
        }
      }
    }
  }

  if (input.corrections && typeof input.corrections === "object") {
    for (const [key, correction] of Object.entries(input.corrections)) {
      if (!VALUE_KEYS.includes(key) || !correction || typeof correction !== "object") continue;
      assertValueType(key, correction.parserValue, context);
      assertValueType(key, correction.userValue, context);
    }
  }

  return migrateLegacyRecord(input);
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

function safeLearnedMappings(mappings) {
  if (!Array.isArray(mappings)) return [];
  return mappings.slice(0, 30).map(mapping => {
    if (!VALUE_KEYS.includes(mapping?.field)) return null;
    const selectors = Array.isArray(mapping?.selectors)
      ? [...new Set(mapping.selectors
          .filter(value => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value))
          .map(value => value.toLowerCase()))].slice(0, 12)
      : [];
    if (!selectors.length) return null;
    return {
      field: mapping.field,
      selectors,
      confirmations: Math.max(1, Math.min(999, Number(mapping?.confirmations) || 1)),
      learnedAt: safeText(mapping?.learnedAt, 40) || null
    };
  }).filter(Boolean);
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
      observations: Math.max(0, Math.min(9999, Number(profile?.observations) || 0)),
      confirmations: Math.max(0, Math.min(999, Number(profile?.confirmations) || 0)),
      autoParses: Math.max(0, Math.min(9999, Number(profile?.autoParses) || 0)),
      mappings: safeLearnedMappings(profile?.mappings),
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

export function payEventKeyFromValues(values = {}) {
  const { payDate, payPeriodStart, payPeriodEnd } = values;
  if (!payDate || !payPeriodStart || !payPeriodEnd) return null;
  return ["event", payDate, payPeriodStart, payPeriodEnd].join("|");
}

const CONFLICT_VALUE_KEYS = [
  "grossPay", "netPay", "ytdTaxableIncome", "previousYearTaxableIncome",
  "taxCardAccumulatedIncome", "withholdingPeriod", "withholdingYtd",
  "taxRate", "taxLimit", "additionalRate", "kta", "pp",
  "overtime100DailyHours", "overtime50WeeklyHours", "overtime100WeeklyHours",
  "overtimeHours", "overtimeCompensation", "sundayHours", "weeklyRestHours",
  "worktimeBankUseHours", "worktimeBankAddHours", "cashPay",
  "taxableBenefits", "taxExemptBenefits", "preTaxSalaryAdjustment"
];

function sameComparableValue(a, b) {
  if (a == null || b == null) return true;
  const aNumber = Number(a);
  const bNumber = Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
    return stableNumber(aNumber) === stableNumber(bNumber);
  }
  return String(a) === String(b);
}

export function recordDifferences(existingInput, incomingInput) {
  const existing = migrateLegacyRecord(existingInput);
  const incoming = migrateLegacyRecord(incomingInput);
  if (!existing || !incoming) return [];

  const differences = [];
  for (const key of CONFLICT_VALUE_KEYS) {
    const before = existing.values?.[key] ?? null;
    const after = incoming.values?.[key] ?? null;
    if (before == null || after == null || sameComparableValue(before, after)) continue;
    differences.push({ key, before, after });
  }
  return differences;
}

export function classifyRecordRelation(existingInput, incomingInput) {
  const existing = migrateLegacyRecord(existingInput);
  const incoming = migrateLegacyRecord(incomingInput);
  if (!existing || !incoming) return { type: "distinct", differences: [] };

  const existingEventKey = payEventKeyFromValues(existing.values);
  const incomingEventKey = payEventKeyFromValues(incoming.values);
  const sameEvent = existingEventKey && incomingEventKey && existingEventKey === incomingEventKey;
  const differences = sameEvent ? recordDifferences(existing, incoming) : [];

  if (sameEvent && differences.length) {
    return { type: "same_event_conflict", eventKey: existingEventKey, differences };
  }
  if (existing.duplicateKey && incoming.duplicateKey && existing.duplicateKey === incoming.duplicateKey) {
    return { type: "exact_duplicate", eventKey: existingEventKey || incomingEventKey || null, differences: [] };
  }
  if (sameEvent) {
    return { type: "same_event_compatible", eventKey: existingEventKey, differences: [] };
  }
  return { type: "distinct", eventKey: null, differences: [] };
}

export function findRecordConflict(records, incomingInput, options = {}) {
  const incoming = migrateLegacyRecord(incomingInput);
  if (!incoming) return null;
  const ignoreRecordId = options?.ignoreRecordId || null;

  for (const existing of Array.isArray(records) ? records : []) {
    if (ignoreRecordId && existing?.id === ignoreRecordId) continue;
    const relation = classifyRecordRelation(existing, incoming);
    if (relation.type === "same_event_conflict") return { existing, ...relation };
  }
  return null;
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

export function recordContentKey(input) {
  const record = migrateLegacyRecord(input);
  if (!record) return "";
  return JSON.stringify({
    kind: record.kind,
    values: record.values,
    fingerprints: [...(record.fingerprints || [])].sort(),
    fieldMeta: record.fieldMeta,
    payLines: record.payLines,
    corrections: record.corrections,
    notices: record.notices,
    parser: record.parser
  });
}

export function sameRecordContent(a, b) {
  const left = recordContentKey(a);
  const right = recordContentKey(b);
  return Boolean(left) && left === right;
}

export function mergeRecords(existingInput, incomingInput) {
  const existing = migrateLegacyRecord(existingInput);
  const incoming = migrateLegacyRecord(incomingInput);
  if (!existing) return incoming;
  if (!incoming) return existing;

  const existingCorrections = existing.corrections || {};
  const incomingCorrections = incoming.corrections || {};
  const mergedValues = pickNonNull(existing.values, incoming.values);

  for (const [key, correction] of Object.entries(existingCorrections)) {
    if (
      !incomingCorrections[key] &&
      correction &&
      Object.prototype.hasOwnProperty.call(correction, "userValue")
    ) {
      mergedValues[key] = correction.userValue;
    }
  }
  for (const [key, correction] of Object.entries(incomingCorrections)) {
    if (correction && Object.prototype.hasOwnProperty.call(correction, "userValue")) {
      mergedValues[key] = correction.userValue;
    }
  }

  const mergedFingerprints = [...new Set([...(existing.fingerprints || []), ...(incoming.fingerprints || [])].filter(Boolean))];
  const useIncomingLines = (incoming.payLines?.length || 0) >= (existing.payLines?.length || 0);
  const duplicateKey = duplicateKeyFromValues(mergedValues, mergedFingerprints[0] || "");

  const candidate = migrateLegacyRecord({
    recordSchemaVersion: RECORD_SCHEMA_VERSION,
    id: existing.id || incoming.id || recordIdFrom(mergedValues, mergedFingerprints[0] || ""),
    kind: existing.kind || incoming.kind || "payslip",
    createdAt: existing.createdAt || incoming.createdAt || nowIso(),
    updatedAt: existing.updatedAt || incoming.updatedAt || nowIso(),
    taxYear: taxYearFromDate(mergedValues.payDate),
    duplicateKey,
    fingerprints: mergedFingerprints,
    values: mergedValues,
    fieldMeta: { ...(existing.fieldMeta || {}), ...(incoming.fieldMeta || {}) },
    payLines: useIncomingLines ? incoming.payLines : existing.payLines,
    corrections: { ...existingCorrections, ...incomingCorrections },
    notices: incoming.notices?.length ? incoming.notices : existing.notices,
    parser: incoming.parser || existing.parser
  });

  if (!sameRecordContent(existing, candidate)) candidate.updatedAt = nowIso();
  return candidate;
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

  if (Array.isArray(payload)) {
    return payload.map((record, index) => validateBackupRecordInput(record, index, true));
  }

  if (payload.app !== "Palkka PWA") {
    throw new Error("Varmuuskopio kuuluu eri sovellukselle.");
  }
  if (payload.backupSchemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error("Varmuuskopion versiota tai skeemaa ei tueta.");
  }
  if (payload.recordSchemaVersion !== RECORD_SCHEMA_VERSION) {
    throw new Error("Varmuuskopion tietueskeemaa ei tueta.");
  }
  if (!Array.isArray(payload.records)) throw new Error("Varmuuskopiosta ei löytynyt palkkatietoja.");

  return payload.records.map((record, index) => validateBackupRecordInput(record, index, false));
}


export function parseBackupLearnedProfiles(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return safeLearnedProfiles(payload.learnedProfiles);
}
