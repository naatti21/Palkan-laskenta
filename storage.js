import { mergeRecords, migrateLegacyRecord } from "./model.js";

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

export async function upsertRecord(record) {
  const incoming = migrateLegacyRecord(record);
  if (!incoming) throw new Error("Tallennettava palkkatieto ei ole kelvollinen.");

  const duplicate = await getByDuplicateKey(incoming.duplicateKey);
  const merged = duplicate ? mergeRecords(duplicate, incoming) : incoming;

  if (duplicate && merged.id !== duplicate.id) merged.id = duplicate.id;

  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, "readwrite");
  tx.objectStore(RECORD_STORE).put(merged);
  await transactionDone(tx);
  return { record: merged, mergedDuplicate: Boolean(duplicate) };
}

export async function mergeManyRecords(records) {
  let added = 0;
  let merged = 0;
  for (const record of records) {
    const result = await upsertRecord(record);
    if (result.mergedDuplicate) merged += 1;
    else added += 1;
  }
  return { added, merged };
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

  let migrated = 0;
  for (const legacy of records) {
    const record = migrateLegacyRecord(legacy);
    if (!record) continue;
    await upsertRecord(record);
    migrated += 1;
  }

  await setSetting("legacyLocalStorageMigrated", true);
  if (migrated > 0) localStorage.removeItem(LEGACY_KEY);
  return { migrated };
}
