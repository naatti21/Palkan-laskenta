import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

test('IndexedDB v1 upgrade retains old history and settings without resetting either store',async()=>{
  const legacy=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('palkka-pwa',1);
    request.onupgradeneeded=()=>{const db=request.result;const s=db.createObjectStore('payslips',{keyPath:'id'});
      s.createIndex('duplicateKey','duplicateKey');s.createIndex('taxYear','taxYear');s.createIndex('payDate','values.payDate');
      db.createObjectStore('settings',{keyPath:'key'});};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  await new Promise((resolve,reject)=>{const tx=legacy.transaction(['payslips','settings'],'readwrite');
    tx.objectStore('payslips').put({recordSchemaVersion:1,id:'legacy-preserved',values:{payDate:'2026-08-28',grossPay:3000,netPay:1900,ytdTaxableIncome:24000},corrections:{ytdTaxableIncome:{parserValue:23000,userValue:24000,correctedAt:'2026-08-29T00:00:00Z'}}});
    tx.objectStore('settings').put({key:'synthetic-setting',value:'preserved'});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });legacy.close();
  const storage=await import('../storage.js');const db=await storage.openDb();
  assert.equal(db.version,2);const records=await storage.getAllRecords();assert.equal(records.length,1);
  assert.equal(records[0].id,'legacy-preserved');assert.equal(records[0].recordSchemaVersion,2);
  assert.equal(records[0].values.ytdTaxableIncome,24000);assert.equal(records[0].corrections.ytdTaxableIncome.parserValue,23000);
  assert.equal(await storage.getSetting('synthetic-setting'),'preserved');
});
