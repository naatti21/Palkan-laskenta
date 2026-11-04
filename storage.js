import {
  classifyRecordRelation,
  hasIncomingUserEdits,
  migrateLegacyRecord,
  recordContentKey,
  visibleRevisions,
  sameRecordContent,
  validateBackupRecordInput
} from "./model.js";

const DB_NAME = "palkka-pwa";
const DB_VERSION = 2;
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
      let blocked = false;
      request.onblocked = () => {
        blocked = true;
        reject(new Error("Sulje muut Palkka-välilehdet ja avaa sovellus uudelleen tietokannan päivittämiseksi. Historia säilyy."));
      };
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
      request.onsuccess = () => {
        if (blocked) { request.result.close(); dbPromise = null; return; }
        request.result.onversionchange = () => { request.result.close(); dbPromise = null; };
        resolve(request.result);
      };
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

// Read, decide and write under the same IndexedDB lock (also serializes other tabs).
async function mutateRecords(decide) {
  const db = await openDb();
  const tx = db.transaction(RECORD_STORE, "readwrite");
  const done = transactionDone(tx);
  const store = tx.objectStore(RECORD_STORE);
  let result;
  let failure;
  const request = store.getAll();
  request.onsuccess = () => {
    try {
      const rows = request.result.map(migrateLegacyRecord);
      result = decide(rows, row => store.put(migrateLegacyRecord(row)));
    } catch (error) { failure = error; tx.abort(); }
  };
  try { await done; } catch (error) { throw failure || error; }
  return result;
}

function candidates(rows, incoming) {
  return visibleRevisions(rows).filter(row => row.id !== incoming.id &&
    classifyRecordRelation(row, incoming).type === "same_event_conflict");
}
function conflictError(rows, incoming = null) {
  const error = new Error("Historia muuttui tai maksu on epäselvä. Tarkista laskelmat uudelleen ennen tallennusta.");
  error.code = "PAY_EVENT_CONFLICT";
  error.candidates = rows;
  error.incoming = incoming;
  return error;
}
function assertExpected(rows, expected, incoming) {
  if (!expected) return;
  const currentCandidates = candidates(rows, incoming);
  if (currentCandidates.some(r => !expected.some(e => e.id === r.id))) throw conflictError(rows);
  for (const snapshot of expected) {
    const current = visibleRevisions(rows).find(r => r.id === snapshot.id);
    if (!current || recordContentKey(current) !== recordContentKey(snapshot) ||
        JSON.stringify([current.payEventId, current.resolution, current.supersedes, current.distinctFrom]) !==
        JSON.stringify([snapshot.payEventId, snapshot.resolution, snapshot.supersedes, snapshot.distinctFrom])) throw conflictError(rows);
  }
}
function archiveReplacement(rows, put, existing, incoming) {
  if (!visibleRevisions(rows).some(r => r.id === existing.id)) throw conflictError(rows);
  const replacement = migrateLegacyRecord({ ...incoming, id: crypto.randomUUID(),
    payEventId: existing.payEventId, resolution: "active",
    distinctFrom: [...new Set([...existing.distinctFrom, ...incoming.distinctFrom])],
    supersedes: [...new Set([...existing.supersedes, existing.id, ...incoming.supersedes])],
    updatedAt: new Date().toISOString() });
  put({ ...existing, resolution: "superseded" });
  put(replacement);
  return replacement;
}
export async function replaceRecord(existingId, record, expected = null) {
  const incoming = migrateLegacyRecord(record);
  return mutateRecords((rows, put) => {
    assertExpected(rows, expected, incoming);
    const existing = rows.find(r => r.id === existingId);
    if (!existing) throw conflictError(rows);
    if (existing.id === incoming.id && sameRecordContent(existing, incoming)) return existing;
    // A stored unresolved input is also an ancestor of the chosen revision.
    const storedIncoming = rows.find(r => r.id === incoming.id && r.id !== existingId && sameRecordContent(r, incoming));
    if (storedIncoming) incoming.supersedes = [...incoming.supersedes, storedIncoming.id];
    return archiveReplacement(rows, put, existing, incoming);
  });
}
export async function upsertRecord(record) {
  const incoming = migrateLegacyRecord(record);
  if (!incoming) throw new Error("Tallennettava palkkatieto ei ole kelvollinen.");
  return mutateRecords((rows, put) => {
    const sameId = rows.find(r => r.id === incoming.id);
    if (sameId && sameRecordContent(sameId, incoming)) return { record: sameId, mergedDuplicate: true };
    // A user edit is an immutable revision, never an overwrite of an old backup ancestor.
    if (sameId && (Object.keys(incoming.corrections).length || Object.keys(sameId.corrections).length)) {
      const conflicts = candidates(rows, incoming);
      if (conflicts.length) throw conflictError(conflicts, incoming);
      return { record: archiveReplacement(rows, put, sameId, incoming), mergedDuplicate: true };
    }
    const source = incoming.sourceHash && rows.filter(r => r.sourceHash === incoming.sourceHash);
    if (source?.length) {
      const active = visibleRevisions(rows).filter(r => source.some(s => r.id === s.id || r.supersedes.includes(s.id)));
      if (active.length === 1 && !hasIncomingUserEdits(active[0], incoming)) return { record: active[0], mergedDuplicate: true };
      throw conflictError(active, incoming);
    }
    const conflicts = candidates(rows, incoming);
    if (conflicts.length || sameId) throw conflictError(conflicts, incoming);
    put(incoming);
    return { record: incoming, mergedDuplicate: false };
  });
}
export async function saveRecordSeparately(record, expected = null) {
  const incoming = migrateLegacyRecord(record);
  return mutateRecords((rows, put) => {
    assertExpected(rows, expected, incoming);
    const repeated = rows.find(r => r.decisionInputId === incoming.id && sameRecordContent(r, incoming));
    if (repeated) return repeated;
    const stored = rows.find(r => r.id === incoming.id && sameRecordContent(r, incoming));
    const relevant = visibleRevisions(rows).filter(r => r.id !== incoming.id && classifyRecordRelation(r, incoming).type !== "distinct");
    if (stored && !relevant.length) return stored;
    const separate = { ...incoming, decisionInputId: incoming.id,
      id: crypto.randomUUID(),
      payEventId: crypto.randomUUID(),
      supersedes: stored ? [...stored.supersedes, stored.id] : incoming.supersedes,
      resolution: "active", distinctFrom: [...incoming.distinctFrom] };
    if (stored) put({ ...stored, resolution: "superseded" });
    // Persist a pairwise decision, never a blanket exemption for future corrections.
    for (const other of relevant) {
      separate.distinctFrom.push(other.payEventId);
      put({ ...other, distinctFrom: [...new Set([...other.distinctFrom, separate.payEventId])] });
    }
    // Same ID may be a legacy collision with changed values.
    if (!stored) for (const other of rows.filter(r => r.id === incoming.id)) {
      separate.distinctFrom.push(other.payEventId);
      put({ ...other, distinctFrom: [...new Set([...other.distinctFrom, separate.payEventId])] });
    }
    separate.distinctFrom = [...new Set(separate.distinctFrom)];
    put(separate);
    return migrateLegacyRecord(separate);
  });
}
export async function mergeManyRecords(records) {
  const incomingRecords = records.map((record, index) => validateBackupRecordInput(record, index, true));
  if (incomingRecords.some(r => !r)) throw new Error("Virheellinen varmuuskopio.");
  return mutateRecords((rows, put) => {
    let added = 0, merged = 0, conflictsPreserved = 0;
    // Resolve the entire incoming graph before writing any node. An ID collision
    // must never let a foreign descendant suppress an unrelated local revision.
    const mapping = new Map();
    const prepared = [];
    const seen = new Set();
    for (let incoming of incomingRecords) {
      if (seen.has(incoming.id)) {
        if (incomingRecords.some(r => r.supersedes.includes(incoming.id))) throw new Error("Varmuuskopion versiosuhde on epäselvä. Historiaa ei muutettu.");
        const duplicate = prepared.find(p => sameRecordContent(p.incoming, incoming));
        if (duplicate) { merged++; continue; }
        const previous = rows.find(r => (r.id === incoming.id || r.importRevisionId === incoming.id) && r.payEventId === incoming.payEventId && sameRecordContent(r, incoming));
        incoming = { ...incoming, id: previous?.id || crypto.randomUUID(), importRevisionId: incoming.id };
      }
      seen.add(incoming.id);
      const same = rows.find(r => r.payEventId === incoming.payEventId &&
        (r.id === incoming.id || r.importRevisionId === incoming.id) && sameRecordContent(r, incoming));
      const collision = rows.some(r => r.id === incoming.id);
      const id = same?.id || (collision ? crypto.randomUUID() : incoming.id);
      mapping.set(incoming.id, id);
      prepared.push({ incoming, same, id, collision });
    }
    const graph = new Map(prepared.map(p => [p.id, p.incoming.supersedes.map(ref => mapping.get(ref) || ref)]));
    const visiting = new Set(), visited = new Set();
    const visit = id => {
      if (visiting.has(id)) throw new Error("Varmuuskopion versiosuhteet muodostavat kehän. Historiaa ei muutettu.");
      if (visited.has(id)) return;
      visiting.add(id);
      for (const ref of graph.get(id) || []) {
        if (!graph.has(ref) && !rows.some(r => r.id === ref && r.resolution === "superseded"))
          throw new Error("Varmuuskopiosta puuttuu korvatun version tiedot. Tuo täydellinen varmuuskopio.");
        if (graph.has(ref)) visit(ref);
      }
      visiting.delete(id); visited.add(id);
    };
    for (const id of graph.keys()) visit(id);
    for (const { incoming, same, id, collision } of prepared) {
      const supersedes = incoming.supersedes.map(ancestor => mapping.get(ancestor) || ancestor);
      if (same) {
        const next = { ...same,
          resolution: same.resolution === "superseded" || incoming.resolution === "superseded" ? "superseded" : same.resolution,
          supersedes: [...new Set([...same.supersedes, ...supersedes])],
          distinctFrom: [...new Set([...same.distinctFrom, ...incoming.distinctFrom])] };
        rows[rows.indexOf(same)] = next; put(next); merged++; continue;
      }
      const next = { ...incoming, id, supersedes,
        importRevisionId: collision ? incoming.id : incoming.importRevisionId };
      if (collision || candidates(rows, next).length) conflictsPreserved++;
      rows.push(next); put(next); added++;
    }
    // Validate the resulting graph, not merely the incoming fragment. Metadata
    // merges can close a cycle through an already stored ancestor. Abort rolls
    // back every queued put, so no visible head disappears on a failed restore.
    const combined = new Map(rows.map(row => [row.id, row.supersedes]));
    const stack = new Set(), complete = new Set();
    const check = id => {
      if (stack.has(id)) throw new Error("Varmuuskopion ja paikallisen historian versiosuhteet muodostavat kehän. Historiaa ei muutettu.");
      if (complete.has(id)) return;
      stack.add(id);
      for (const ref of combined.get(id) || []) if (combined.has(ref)) check(ref);
      stack.delete(id); complete.add(id);
    };
    for (const id of combined.keys()) check(id);
    return { added, merged, conflictsPreserved };
  });
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
