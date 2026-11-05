import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import * as db from '../storage.js';
import {migrateLegacyRecord, makeBackup, parseBackup, parseBackupIncomeSources} from '../model.js';
import {buildYearAnalysis} from '../analytics.js';
import {forecastTaxCardLimit} from '../taxcard-forecast.js';
import {deriveTaxDefaults} from '../scenario-model.js';

const row = (id, incomeSourceId, grossPay, extra={}) => migrateLegacyRecord({
  id, recordSchemaVersion:3, incomeSourceId, taxCardId:'shared-card',
  values:{payDate:'2026-10-30',payPeriodStart:'2026-10-01',payPeriodEnd:'2026-10-15',
    grossPay, netPay:grossPay*0.75, ytdTaxableIncome:grossPay*9,
    taxLimit:60000, taxCardAccumulatedIncome:grossPay*8}, ...extra});
beforeEach(()=>db.clearAllRecords());

for (const count of [1,2,3,5]) test(count+' overlapping confirmed sources count once and keep separate snapshots',async()=>{
  const amounts=[3000,800,450,120,200].slice(0,count);
  const sources=await Promise.all(amounts.map((_,i)=>db.createIncomeSource('Työ '+(i+1))));
  const rows=amounts.map((amount,i)=>row('pay-'+i,sources[i].id,amount,{sourceHash:i.toString().repeat(64)}));
  await Promise.all(rows.map(r=>db.upsertRecord(r)));
  await db.upsertRecord({...rows[0], id:'repeat'});
  const backup=makeBackup(await db.getAllRecords(),{incomeSources:sources});
  await db.mergeManyRecords(parseBackup(backup),parseBackupIncomeSources(backup));
  const history=await db.getAllRecords(), analysis=buildYearAnalysis(history,2026);
  assert.equal(history.length,count);
  assert.equal(analysis.totalGross,amounts.reduce((a,b)=>a+b,0));
  assert.equal(analysis.sourceSnapshots.length,count);
  if(count===3) assert.equal(analysis.totalGross,4250);
  if(count>1) {
    assert.equal(analysis.latestYtd,null);
    assert.equal(forecastTaxCardLimit(history,2026).valid,false);
    assert.equal(deriveTaxDefaults(history,2026).remainingLimit,null);
  }
});
test('correction archives only its own source and stale backup preserves both jobs',async()=>{
 const a=await db.createIncomeSource('A'),b=await db.createIncomeSource('B');
 const old=row('old',a.id,3000), second=row('second',b.id,800);
 await db.upsertRecord(old);await db.upsertRecord(second);
 const correction=row('new',a.id,3100);
 await assert.rejects(db.replaceRecord(second.id,correction),/eri tulolähteiden/i);
 await db.replaceRecord(old.id,correction,[old]);
 await db.mergeManyRecords([old,second],[a,b]);
 const history=await db.getAllRecords();
 assert.equal(history.length,3);assert.equal(buildYearAnalysis(history,2026).totalGross,3900);
});
test('restore aborts source definitions and all rows for a dangling reference',async()=>{
 const count=(await db.getIncomeSources()).length;
 await assert.rejects(db.mergeManyRecords([row('one','allowed',50),row('bad','missing',10)],[{id:'allowed',name:'A'}]),/puuttuu/);
 assert.equal((await db.getAllRecords()).length,0);assert.equal((await db.getIncomeSources()).length,count);
});
test('old backup has unknown payer and cannot establish a second independent payment',async()=>{
 const legacy=migrateLegacyRecord({recordSchemaVersion:1,id:'legacy',employerName:'fiction',values:row('x',null,3000).values});
 assert.equal(legacy.incomeSourceId,null);assert.equal('employerName' in legacy,false);
 await db.upsertRecord(legacy);
 const known=await db.createIncomeSource('');
 await assert.rejects(db.upsertRecord(row('new',known.id,800)),e=>e.code==='PAY_EVENT_CONFLICT');
});
test('unknown intermediate revisions cannot link two payers during restore or replacement',async()=>{
 const a=await db.createIncomeSource('A'),b=await db.createIncomeSource('B');
 const origin=row('origin',a.id,3000), middle=row('unknown',null,3000,{supersedes:['origin']});
 const other=row('other',b.id,450,{supersedes:['unknown']});
 await assert.rejects(db.mergeManyRecords([origin,middle,other]),/eri tulolähteitä/);
 assert.equal((await db.getAllRecords()).length,0);
 await db.mergeManyRecords([origin,middle]);
 await assert.rejects(db.replaceRecord(middle.id,row('fresh',b.id,450)),/eri tulolähteitä/);
 assert.equal((await db.getAllRecords()).length,2);
});
test('old copy of the same revision preserves local source decision',async()=>{
 const source=await db.createIncomeSource();
 const local=row('original',source.id,3000);
 await db.upsertRecord(local);
 await db.mergeManyRecords([{...local,recordSchemaVersion:2,incomeSourceId:undefined,taxCardId:undefined}]);
 const saved=await db.getAllRecords();
 assert.equal(saved.length,1);assert.equal(saved[0].incomeSourceId,source.id);
});
test('portable backup recreates source registry, the card identity and scoped observations',async()=>{
 const sources=[{id:'portable-a',name:'Työ A'},{id:'portable-b',name:'Työ B'}];
 const records=sources.map((s,i)=>row('restored-'+i,s.id,500+i));
 const backup=JSON.parse(JSON.stringify(makeBackup(records,{incomeSources:sources})));
 await db.mergeManyRecords(parseBackup(backup),parseBackupIncomeSources(backup));
 const registry=await db.getIncomeSources();
 for(const source of sources) assert.deepEqual(registry.find(s=>s.id===source.id),source);
 const yearly=buildYearAnalysis(await db.getAllRecords(),2026);
 assert.equal(yearly.totalGross,1001);
 assert.deepEqual(yearly.sourceSnapshots.map(s=>[s.incomeSourceId,s.taxCardId,s.cardAccumulated]),
   [['portable-a','shared-card',4000],['portable-b','shared-card',4008]]);
});
