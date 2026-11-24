import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { getAllRecords, getSetting, migrateLegacyLocalStorage, upsertRecord } from "../storage.js";
import { buildYearAnalysis } from "../analytics.js";
import { migrateLegacyRecord } from "../model.js";

test("unknown legacy records preserve the original history and allow a later retry", async () => {
  const key = "palkka-pwa-proto:v1";
  const valid = { id: "synthetic", payDate: "2025-12-31", grossPay: 2000.05, netPay: 1700.02 };
  const raw = JSON.stringify([valid, { recordSchemaVersion: 99, values: valid }]);
  const storage = new Map([[key, raw]]);
  globalThis.localStorage = {
    getItem: name => storage.get(name) ?? null,
    removeItem: name => storage.delete(name)
  };
  await assert.rejects(migrateLegacyLocalStorage(), /Alkuperäinen historia säilytettiin/);
  assert.equal(storage.get(key), raw);
  assert.equal(await getSetting("legacyLocalStorageMigrated"), null);
  assert.deepEqual(await getAllRecords(), []);

  storage.set(key, JSON.stringify([valid]));
  assert.deepEqual(await migrateLegacyLocalStorage(), { migrated: 1 });
  assert.equal(storage.has(key), false);
  assert.deepEqual(await migrateLegacyLocalStorage(), { migrated: 0 });
  assert.equal((await getAllRecords())[0].values.netPay, 1700.02);
});

test("hand-checked cents keep a negative adjustment in the payment year", () => {
  const rows = [
    ["previous", "2025-12-31", 3000.30, 2000.10, "A"],
    ["january", "2026-01-03", 1000.01, 800.10, "A"],
    ["other-job", "2026-01-03", 250.49, 199.99, "B"],
    ["adjustment", "2026-01-20", -50.20, -40.14, "A"]
  ].map(([id, payDate, grossPay, netPay, incomeSourceId]) =>
    migrateLegacyRecord({ id, incomeSourceId, values: { payDate, grossPay, netPay }, recordSchemaVersion: 3 }));
  const january = buildYearAnalysis(rows, 2026).months[0];
  // 1000.01 + 250.49 - 50.20; 800.10 + 199.99 - 40.14.
  assert.equal(january.gross, 1200.30);
  assert.equal(january.net, 959.95);
  assert.equal(buildYearAnalysis(rows, 2025).totalNet, 2000.10);
});

test("quota failure aborts a new payment without changing existing history", async () => {
  const before = await getAllRecords();
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value) {
    if (this.name === "payslips") throw new DOMException("Synthetic quota failure", "QuotaExceededError");
    return put.call(this, value);
  };
  try {
    await assert.rejects(upsertRecord(migrateLegacyRecord({
      payDate: "2026-10-31", grossPay: 1234.56, netPay: 987.65
    })), {name:"QuotaExceededError"});
    assert.deepEqual(await getAllRecords(), before);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
});
