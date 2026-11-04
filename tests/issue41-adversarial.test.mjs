// Independent synthetic adversarial cases; no real salary data or documents.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import * as storage from '../storage.js';
import {migrateLegacyRecord,projectPayroll,makeBackup,parseBackup,applyUserCorrections} from '../model.js';
import {buildYearAnalysis} from '../analytics.js';
const make=(id,extra={})=>migrateLegacyRecord({recordSchemaVersion:2,id,payEventId:'event',sourceHash:null,
 values:{payDate:'2026-10-30',payPeriodStart:'2026-10-01',payPeriodEnd:'2026-10-15',grossPay:2000,netPay:1400,ytdTaxableIncome:20000},...extra});
beforeEach(async()=>storage.clearAllRecords());
test('R41-01 imported edges cannot close a cycle through local archived ancestry',async()=>{
 const a=make('a',{resolution:'superseded'}),b=make('b',{supersedes:['a'],resolution:'superseded'}),c=make('c',{supersedes:['a','b']});
 await storage.mergeManyRecords([a,b,c]);
 const before=await storage.getAllRecords();
 // The payload alone is acyclic, but adding a -> b closes local b -> a.
 await assert.rejects(storage.mergeManyRecords([{...a,supersedes:['b']}]));
 assert.deepEqual(await storage.getAllRecords(),before);
 assert.equal(buildYearAnalysis(await storage.getAllRecords(),2026).totalNet,1400);
});
test('R41-02 generic confirmed-distinct status is not a pairwise payment decision',()=>{
 const a=make('a',{payEventId:'one',resolution:'confirmed-distinct'}),b=make('b',{payEventId:'two',resolution:'confirmed-distinct'});
 assert.equal(projectPayroll([a,b]).unresolved.length,2);
 assert.equal(buildYearAnalysis([a,b],2026).totalNet,null);
});
test('R41-03 stale dialog rejects changed lineage even when salary content is identical',async()=>{
 const a=make('a'),parent=make('parent',{resolution:'superseded'});
 await storage.mergeManyRecords([a,parent]);
 const snapshot=(await storage.getAllRecords()).find(r=>r.id==='a');
 await storage.mergeManyRecords([{...a,supersedes:['parent']},parent]);
 const before=await storage.getAllRecords();
 await assert.rejects(storage.replaceRecord('a',make('new'),[snapshot]),e=>e.code==='PAY_EVENT_CONFLICT');
 assert.deepEqual(await storage.getAllRecords(),before);
});
test('R41-04 direct restore rejects invalid financial values atomically',async()=>{
 await storage.upsertRecord(make('local'));
 const before=await storage.getAllRecords();
 const invalid=make('invalid',{values:{...make('x').values,netPay:NaN}});
 await assert.rejects(storage.mergeManyRecords([make('valid'),invalid]));
 assert.deepEqual(await storage.getAllRecords(),before);
});
test('R41-05 transaction abort rolls back an earlier queued write',async()=>{
 await storage.upsertRecord(make('local'));const before=await storage.getAllRecords();
 const db=await storage.openDb();const tx=db.transaction('payslips','readwrite');
 const completed=new Promise(resolve=>tx.onabort=resolve);
 tx.objectStore('payslips').put(make('uncommitted'));tx.abort();await completed;
 assert.deepEqual(await storage.getAllRecords(),before);
});
test('R41-06 three replacements and original SHA reimport retain corrected YTD',async()=>{
 const original=make('first',{sourceHash:'1'.repeat(64)});await storage.upsertRecord(original);
 let head=(await storage.upsertRecord(applyUserCorrections(original,{ytdTaxableIncome:21000}))).record;
 for(let i=0;i<3;i++)head=await storage.replaceRecord(head.id,make('revision-'+i,{sourceHash:String(i+2).repeat(64),values:{...head.values,netPay:1450+i}}),[head]);
 await storage.upsertRecord({...original,id:'reimport'});
 const rows=await storage.getAllRecords();assert.equal(rows.length,5);
 assert.equal(projectPayroll(rows).active.length,1);assert.equal(buildYearAnalysis(rows,2026).latestYtd,21000);
 const backup=parseBackup(makeBackup(rows));await storage.mergeManyRecords(backup);await storage.mergeManyRecords([...backup].reverse());
 assert.equal((await storage.getAllRecords()).length,5);
});
test('R41-07 same visible figures with a different SHA remain unresolved, not auto-deduped',async()=>{
 await storage.upsertRecord(make('first',{sourceHash:'a'.repeat(64)}));
 await assert.rejects(storage.upsertRecord(make('second',{sourceHash:'b'.repeat(64)})),e=>e.code==='PAY_EVENT_CONFLICT');
 assert.equal((await storage.getAllRecords()).length,1);
});
test('pairwise separation is not transitive and never authorizes a third payment',()=>{
 const a=make('a',{payEventId:'A',resolution:'confirmed-distinct',distinctFrom:['B','C']});
 const b=make('b',{payEventId:'B',resolution:'confirmed-distinct',distinctFrom:['A']});
 const c=make('c',{payEventId:'C',resolution:'confirmed-distinct',distinctFrom:['A']});
 const p=projectPayroll([a,b,c]);assert.equal(p.active.length,1);assert.equal(p.unresolved.length,2);
 assert.equal(buildYearAnalysis([a,b,c],2026).totalNet,null);
});
test('legacy blanket flags remain unresolved until a durable pair decision, including old backup replay',async()=>{
 const a=make('a',{payEventId:'A',resolution:'confirmed-distinct'}),b=make('b',{payEventId:'B',resolution:'confirmed-distinct'});
 const old=makeBackup([a,b]);await storage.mergeManyRecords(parseBackup(old));
 assert.equal(projectPayroll(await storage.getAllRecords()).unresolved.length,2);
 await storage.saveRecordSeparately(b,[a]);
 assert.equal(buildYearAnalysis(await storage.getAllRecords(),2026).totalNet,2800);
 await storage.mergeManyRecords(parseBackup(old));
 assert.equal(buildYearAnalysis(await storage.getAllRecords(),2026).totalNet,2800);
 const backup=makeBackup(await storage.getAllRecords());await storage.clearAllRecords();await storage.mergeManyRecords(parseBackup(backup));
 assert.equal(buildYearAnalysis(await storage.getAllRecords(),2026).totalNet,2800);
});
