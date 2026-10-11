import {
  classifyRecordRelation,
  mergeRecords,
  migrateLegacyRecord,
  recordContentKey,
  sameRecordContent
} from "./model.js";

const DB_NAME = "palkka-pwa";
const DB_VERSION = 1;
const RECORD_STORE = "payslips";
const SETTINGS_STORE = "settings";
const LEGACY_KEY = "palkka-pwa-proto:v1";

let dbPromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB-toiminto epäonnistui."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB-transaktio epäonnistui."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB-transaktio keskeytyi."));
  });
}

export function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RECORD_STORE)) {
          const store = db.createObjectStore(RECORD_STORE, { keyPath: "id" });
          store.createIndex("payDate", "values.payDate", { unique: false });
          store.createIndex("taxYear", "taxYear", { unique: false });
          store.createIndex("duplicateKey", "duplicateKey", { unique: false });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Paikallisen tietokannan avaaminen epäonnistui."));
    });
  }
  return dbPromise;
}

export async function getAllRecords() {
  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, "readonly");
  const done = transactionDone(tx);
  const records = await requestToPromise(tx.objectStore(RECORD_STORE).getAll());
  await done;
  return records.map(migrateLegacyRecord).filter(Boolean);
}

async function getByDuplicateKey(duplicateKey) {
  if (!duplicateKey) return null;
  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, "readonly");
  const done = transactionDone(tx);
  const record = await requestToPromise(tx.objectStore(RECORD_STORE).index("duplicateKey").get(duplicateKey));
  await done;
  return record ? migrateLegacyRecord(record) : null;
}

async function getByFingerprint(fingerprint) {
  if (!fingerprint) return null;
  const records = await getAllRecords();
  return records.find(record => (record.fingerprints || []).includes(fingerprint)) || null;
}

async function getById(id) {
  if (!id) return null;
  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, "readonly");
  const done = transactionDone(tx);
  const record = await requestToPromise(tx.objectStore(RECORD_STORE).get(id));
  await done;
  return record ? migrateLegacyRecord(record) : null;
}

export async function replaceRecord(existingId, record) {
  const incoming = migrateLegacyRecord(record);
  if (!incoming) throw new Error("Korvaava palkkatieto ei ole kelvollinen.");

  const existing = await getById(existingId);
  if (!existing) throw new Error("Korvattavaa palkkalaskelmaa ei löytynyt.");

  const replacement = migrateLegacyRecord({
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: new Date().toISOString(),
    fingerprints: [...new Set([...(incoming.fingerprints || [])].filter(Boolean))]
  });

  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, "readwrite");
  tx.objectStore(RECORD_STORE).put(replacement);
  await transactionDone(tx);
  return replacement;
}

export async function upsertRecord(record) {
  const incoming = migrateLegacyRecord(record);
  if (!incoming) throw new Error("Tallennettava palkkatieto ei ole kelvollinen.");

  const fingerprint = incoming.fingerprints?.[0] || "";
  const duplicate = await getByFingerprint(fingerprint) || await getByDuplicateKey(incoming.duplicateKey);
  const merged = duplicate ? mergeRecords(duplicate, incoming) : incoming;

  if (duplicate && merged.id !== duplicate.id) merged.id = duplicate.id;

  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, "readwrite");
  tx.objectStore(RECORD_STORE).put(merged);
  await transactionDone(tx);
  return { record: merged, mergedDuplicate: Boolean(duplicate) };
}

function contentHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function compatibleRecord(records, incoming, ignoreId = null) {
  const incomingFingerprints = new Set(incoming.fingerprints || []);
  return records.find(existing => {
    if (ignoreId && existing.id === ignoreId) return false;
    if (sameRecordContent(existing, incoming)) return true;

    const relation = classifyRecordRelation(existing, incoming);
    if (relation.type === "same_event_conflict") return false;

    if ((existing.fingerprints || []).some(fp => incomingFingerprints.has(fp))) return true;
    return relation.type === "exact_duplicate" || relation.type === "same_event_compatible";
  }) || null;
}

function makeSeparateRecord(incoming, records) {
  const fingerprint = incoming.fingerprints?.[0] || "";
  const suffix = fingerprint
    ? fingerprint.slice(0, 12)
    : contentHash(recordContentKey(incoming)).slice(0, 12);
  const base = `${incoming.id || "payslip"}__variant_${suffix}`;
  let id = base;
  let counter = 1;

  while (records.some(record => record.id === id && !sameRecordContent(record, incoming))) {
    id = `${base}_${counter++}`;
  }

  const existing = records.find(record => record.id === id);
  if (existing && sameRecordContent(existing, incoming)) return existing;

  return migrateLegacyRecord({
    ...incoming,
    id,
    updatedAt: incoming.updatedAt || new Date().toISOString()
  });
}

function planRecordMerge(existingRecords, incomingRecords) {
  const working = existingRecords.map(migrateLegacyRecord).filter(Boolean);
  let added = 0;
  let merged = 0;
  let conflictsPreserved = 0;

  for (const raw of incomingRecords) {
    const incoming = migrateLegacyRecord(raw);
    if (!incoming) throw new Error("Palautettava palkkatieto ei ole kelvollinen.");

    const already = compatibleRecord(working, incoming);
    if (already && (sameRecordContent(already, incoming) || (incoming.fingerprints || []).some(fp => (already.fingerprints || []).includes(fp)))) {
      const next = mergeRecords(already, incoming);
      const index = working.findIndex(record => record.id === already.id);
      working[index] = next;
      merged += 1;
      continue;
    }

    const sameId = working.find(existing => existing.id === incoming.id) || null;
    if (sameId) {
      const relation = classifyRecordRelation(sameId, incoming);
      if (relation.type === "same_event_conflict" || relation.type === "distinct") {
        const acceptedVariant = compatibleRecord(working, incoming, sameId.id);
        if (acceptedVariant) {
          const next = mergeRecords(acceptedVariant, incoming);
          const index = working.findIndex(record => record.id === acceptedVariant.id);
          working[index] = next;
          merged += 1;
          continue;
        }
        const separate = makeSeparateRecord(incoming, working);
        if (!working.some(record => record.id === separate.id)) working.push(separate);
        added += 1;
        conflictsPreserved += 1;
        continue;
      }

      const next = mergeRecords(sameId, incoming);
      const index = working.findIndex(record => record.id === sameId.id);
      working[index] = next;
      merged += 1;
      continue;
    }

    const duplicate = compatibleRecord(working, incoming);
    if (duplicate) {
      const next = mergeRecords(duplicate, incoming);
      const index = working.findIndex(record => record.id === duplicate.id);
      working[index] = next;
      merged += 1;
      continue;
    }

    const conflict = working.find(existing =>
      classifyRecordRelation(existing, incoming).type === "same_event_conflict"
    );
    if (conflict) {
      working.push(incoming);
      added += 1;
      conflictsPreserved += 1;
      continue;
    }

    working.push(incoming);
    added += 1;
  }

  return { records: working, added, merged, conflictsPreserved };
}

async function replaceAllRecordsAtomically(records) {
  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, "readwrite");
  const done = transactionDone(tx);
  const store = tx.objectStore(RECORD_STORE);

  try {
    store.clear();
    for (const record of records) store.put(record);
    await done;
  } catch (err) {
    try { tx.abort(); } catch {}
    try { await done; } catch {}
    throw err;
  }
}

export async function saveRecordSeparately(record) {
  const incoming = migrateLegacyRecord(record);
  if (!incoming) throw new Error("Tallennettava palkkatieto ei ole kelvollinen.");

  const records = await getAllRecords();
  const accepted = compatibleRecord(records, incoming);
  if (accepted) {
    const merged = mergeRecords(accepted, incoming);
    if (!sameRecordContent(accepted, merged) || accepted.updatedAt !== merged.updatedAt) {
      const db = await openDb();
      const tx = db.transaction(RECORD_STORE, "readwrite");
      tx.objectStore(RECORD_STORE).put(merged);
      await transactionDone(tx);
    }
    return merged;
  }

  const separate = makeSeparateRecord(incoming, records);
  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, "readwrite");
  tx.objectStore(RECORD_STORE).put(separate);
  await transactionDone(tx);
  return separate;
}

export async function mergeManyRecords(records) {
  const existing = await getAllRecords();
  const plan = planRecordMerge(existing, records);

  const currentSnapshot = JSON.stringify(existing);
  const nextSnapshot = JSON.stringify(plan.records);
  if (currentSnapshot !== nextSnapshot) {
    await replaceAllRecordsAtomically(plan.records);
  }

  return {
    added: plan.added,
    merged: plan.merged,
    conflictsPreserved: plan.conflictsPreserved
  };
}

export async function clearAllRecords() {
  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, "readwrite");
  tx.objectStore(RECORD_STORE).clear();
  await transactionDone(tx);
}

export async function getSetting(key) {
  const db = await openDb();
  const tx = db.transaction(SETTINGS_STORE, "readonly");
  const done = transactionDone(tx);
  const row = await requestToPromise(tx.objectStore(SETTINGS_STORE).get(key));
  await done;
  return row?.value ?? null;
}

export async function setSetting(key, value) {
  const db = await openDb();
  const tx = db.transaction(SETTINGS_STORE, "readwrite");
  tx.objectStore(SETTINGS_STORE).put({ key, value });
  await transactionDone(tx);
}

export async function migrateLegacyLocalStorage() {
  const done = await getSetting("legacyLocalStorageMigrated");
  if (done) return { migrated: 0 };

  let records = [];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) records = parsed;
    }
  } catch {
    records = [];
  }

  const migratedRecords = records.map(migrateLegacyRecord).filter(Boolean);
  if (migratedRecords.length) await mergeManyRecords(migratedRecords);

  await setSetting("legacyLocalStorageMigrated", true);
  if (migratedRecords.length > 0) localStorage.removeItem(LEGACY_KEY);
  return { migrated: migratedRecords.length };
}
