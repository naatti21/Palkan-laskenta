import { fiNumber, isoDate } from "./parser.js";

const LEARNABLE_FIELDS = new Set([
  "payPeriodStart", "payPeriodEnd", "payDate",
  "grossPay", "netPay", "ytdTaxableIncome",
  "taxCardAccumulatedIncome", "withholdingPeriod", "withholdingYtd",
  "taxRate", "taxLimit", "additionalRate", "kta", "pp"
]);

const DATE_FIELDS = new Set(["payPeriodStart", "payPeriodEnd", "payDate"]);
const PII_LABEL_RE = /henkilötunnus|pankkitili|palkansaaja|henkilönro|osoite|sotu|iban/i;
const PAYLINE_RE = /^\s*\d{3,6}\s+\S/;
const DATE_TOKEN_RE = /\d{1,2}\.\d{1,2}\.\d{4}/g;
const NUMBER_TOKEN_RE = /-?\d[\d\s\u00A0]*(?:,\d+)?/g;

function cleanLines(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(line => line.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeContext(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\d[\d\s.,:/%€+-]*/g, " ")
    .replace(/[^a-zåäö\s./_-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function safeLabelText(value) {
  const text = String(value || "").trim();
  if (!text || PII_LABEL_RE.test(text) || PAYLINE_RE.test(text)) return null;
  const normalized = normalizeContext(text);
  if (!/[a-zåäö]/i.test(normalized) || normalized.length < 2) return null;
  return normalized;
}

function isHeadingLike(line) {
  const text = String(line || "").trim();
  if (!text || PII_LABEL_RE.test(text) || PAYLINE_RE.test(text)) return false;
  const normalized = normalizeContext(text);
  if (!normalized || normalized.length > 80) return false;
  if (/kauden|vuoden|kertym|verot|palkka|tiedot|yhteenveto|perustiedot|erittely/i.test(normalized)) return true;
  const letters = text.replace(/[^A-Za-zÅÄÖåäö]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function previousLabel(lines, index) {
  for (let i = index - 1; i >= 0 && i >= index - 3; i--) {
    const candidate = safeLabelText(lines[i]);
    if (candidate) return { text: candidate, index: i };
  }
  return null;
}

function previousHeading(lines, beforeIndex) {
  for (let i = beforeIndex - 1; i >= 0 && i >= beforeIndex - 8; i--) {
    if (!isHeadingLike(lines[i])) continue;
    const candidate = safeLabelText(lines[i]);
    if (candidate) return candidate;
  }
  return "";
}

function numericEquals(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) <= 0.005;
}

async function scanOccurrences(rawText, field) {
  const lines = cleanLines(rawText);
  const isDate = DATE_FIELDS.has(field);
  const occurrences = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (PII_LABEL_RE.test(line) || PAYLINE_RE.test(line)) continue;

    const regex = isDate ? new RegExp(DATE_TOKEN_RE.source, "g") : new RegExp(NUMBER_TOKEN_RE.source, "g");
    for (const match of line.matchAll(regex)) {
      const token = match[0];
      const value = isDate ? isoDate(token) : fiNumber(token);
      if (value == null) continue;

      const before = line.slice(0, match.index).trim();
      let label = safeLabelText(before);
      let labelIndex = lineIndex;
      if (!label) {
        const previous = previousLabel(lines, lineIndex);
        if (!previous) continue;
        label = previous.text;
        labelIndex = previous.index;
      }

      const parent = previousHeading(lines, labelIndex);
      const signature = `parent:${parent}|label:${label}|kind:${isDate ? "date" : "number"}`;
      const selector = await sha256(signature);
      occurrences.push({ selector, value });
    }
  }

  return occurrences;
}

export function sanitizeMappings(mappings) {
  if (!Array.isArray(mappings)) return [];
  return mappings.slice(0, 30).map(mapping => {
    if (!LEARNABLE_FIELDS.has(mapping?.field)) return null;
    const selectors = [...new Set((mapping.selectors || [])
      .filter(value => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value))
      .map(value => value.toLowerCase()))].slice(0, 12);
    if (!selectors.length) return null;
    return {
      field: mapping.field,
      selectors,
      confirmations: Math.max(1, Math.min(999, Number(mapping.confirmations) || 1)),
      learnedAt: typeof mapping.learnedAt === "string" ? mapping.learnedAt.slice(0, 40) : null
    };
  }).filter(Boolean);
}

export function mergeMappingUpdates(existing, updates) {
  const merged = sanitizeMappings(existing);
  for (const update of sanitizeMappings(updates)) {
    const index = merged.findIndex(item => item.field === update.field);
    if (index < 0) {
      merged.push(update);
      continue;
    }

    const previous = merged[index];
    const overlap = update.selectors.some(selector => previous.selectors.includes(selector));
    merged[index] = overlap
      ? {
          ...previous,
          selectors: [...new Set([...previous.selectors, ...update.selectors])].slice(0, 12),
          confirmations: Math.min(999, (previous.confirmations || 1) + 1),
          learnedAt: update.learnedAt || previous.learnedAt
        }
      : update;
  }
  return sanitizeMappings(merged);
}

export async function learnMappingsFromCorrections(rawText, corrections) {
  if (!corrections || typeof corrections !== "object") return [];
  const learnedAt = new Date().toISOString();
  const updates = [];

  for (const [field, correction] of Object.entries(corrections)) {
    if (!LEARNABLE_FIELDS.has(field) || correction?.userValue == null) continue;
    const occurrences = await scanOccurrences(rawText, field);
    const matches = occurrences.filter(item => DATE_FIELDS.has(field)
      ? item.value === correction.userValue
      : numericEquals(item.value, correction.userValue));

    const selectors = [...new Set(matches.map(item => item.selector))].slice(0, 12);
    if (!selectors.length) continue;
    updates.push({ field, selectors, confirmations: 1, learnedAt });
  }

  return sanitizeMappings(updates);
}

export async function applyLearnedMappings(rawText, mappings) {
  const safeMappings = sanitizeMappings(mappings);
  if (!safeMappings.length) return {};

  const result = {};
  const byKind = new Map();

  for (const mapping of safeMappings) {
    const kind = DATE_FIELDS.has(mapping.field) ? "date" : "number";
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(mapping);
  }

  for (const mappingsOfKind of byKind.values()) {
    const sampleField = mappingsOfKind[0].field;
    const occurrences = await scanOccurrences(rawText, sampleField);
    const selectorValues = new Map();
    for (const occurrence of occurrences) {
      if (!selectorValues.has(occurrence.selector)) selectorValues.set(occurrence.selector, []);
      selectorValues.get(occurrence.selector).push(occurrence.value);
    }

    for (const mapping of mappingsOfKind) {
      const values = [];
      for (const selector of mapping.selectors) {
        values.push(...(selectorValues.get(selector) || []));
      }
      const unique = [];
      for (const value of values) {
        const exists = unique.some(previous => DATE_FIELDS.has(mapping.field)
          ? previous === value
          : numericEquals(previous, value));
        if (!exists) unique.push(value);
      }
      if (unique.length === 1) result[mapping.field] = unique[0];
    }
  }

  return result;
}
