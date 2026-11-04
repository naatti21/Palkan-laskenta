// All amounts, identifiers and document hashes below are synthetic.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import * as store from '../storage.js';
import { migrateLegacyRecord, applyUserCorrections, makeBackup, parseBackup, projectPayroll, findRecordConflict } from '../model.js';
import { buildYearAnalysis } from '../analytics.js';
import { forecastTaxCardLimit } from '../taxcard-forecast.js';
import { deriveTaxDefaults } from '../scenario-model.js';

const slip = (id, values = {}, extra = {}) => migrateLegacyRecord({recordSchemaVersion:1,id,
  values:{payDate:'2026-08-28',payPeriodStart:'2026-08-01',payPeriodEnd:'2026-08-15',
    grossPay:3000,netPay:1900,ytdTaxableIncome:24000,withholdingPeriod:-800,
    taxLimit:50000,taxCardAccumulatedIncome:24000,taxRate:20,additionalRate:40,...values},
  sourceHash: id === 'a' ? 'a'.repeat(64) : id === 'b' ? 'b'.repeat(64) : null,...extra});
const all = () => store.getAllRecords();
const analysis = async () => buildYearAnalysis(await all(),2026);
const conflict = incoming => assert.rejects(store.upsertRecord(incoming), e=>e.code==='PAY_EVENT_CONFLICT');
beforeEach(async()=>{ await store.clearAllRecords(); });

test('E01 exact PDF source import is idempotent even with a new transient record ID',async()=>{
  await store.upsertRecord(slip('a'));
  await store.upsertRecord(slip('copy',{}, {sourceHash:'a'.repeat(64)}));
  assert.equal((await all()).length,1); assert.equal((await analysis()).totalNet,1900);
});
test('E02 same values from another document require confirmation',async()=>{
  await store.upsertRecord(slip('a')); await conflict(slip('b')); assert.equal((await all()).length,1);
});
test('E03 changed net requires explicit revision and retains the original',async()=>{
  const a=slip('a'),b=slip('b',{netPay:1950}); await store.upsertRecord(a); await conflict(b);
  await store.replaceRecord(a.id,b,[a]); assert.equal((await all()).length,2); assert.equal((await analysis()).totalNet,1950);
});
test('E04 changed withholding cannot hide behind identical totals',async()=>{
  await store.upsertRecord(slip('a')); await conflict(slip('b',{withholdingPeriod:-700}));
});
test('E05 separate true bonus is included exactly once',async()=>{
  const a=slip('a'),b=slip('b',{grossPay:500,netPay:300});await store.upsertRecord(a);
  await store.saveRecordSeparately(b,[a]); await store.saveRecordSeparately(b);
  assert.equal((await analysis()).totalNet,2200); assert.equal((await all()).length,2);
});
test('E06 identical amounts and identical semantic/source fingerprint can be explicitly separate',async()=>{
  const a=slip('a'),b=slip('b',{}, {sourceHash:'a'.repeat(64)});await store.upsertRecord(a);
  // Explicit user decision is stronger than source/amount matching.
  await store.saveRecordSeparately(b,[a]);
  assert.equal((await analysis()).totalNet,3800); assert.equal((await analysis()).conflictingRecords,0);
});
test('E07 correction with changed payday requires review',async()=>{
  await store.upsertRecord(slip('a')); await conflict(slip('b',{payDate:'2026-08-29'}));
});
test('E08 separate supplement on another payday counts after confirmation',async()=>{
  await store.upsertRecord(slip('a'));await store.saveRecordSeparately(slip('b',{payDate:'2026-08-29',netPay:100}));
  assert.equal((await analysis()).totalNet,2000);
});
test('E09 shifted period boundary requires review',async()=>{
  await store.upsertRecord(slip('a'));await conflict(slip('b',{payPeriodEnd:'2026-08-16'}));
});
test('E10 overlapping periods are not merged automatically',async()=>{
  await store.upsertRecord(slip('a'));await conflict(slip('b',{payPeriodStart:'2026-08-10',payPeriodEnd:'2026-08-24'}));
});
test('E11 disjoint periods paid on same date remain separate',async()=>{
  await store.upsertRecord(slip('a'));await store.upsertRecord(slip('b',{payPeriodStart:'2026-08-16',payPeriodEnd:'2026-08-31'}));
  assert.equal((await analysis()).totalNet,3800);assert.equal((await analysis()).latestYtd,null);
});
test('E12 missing period fields never prove equality by amounts',async()=>{
  await store.upsertRecord(slip('a',{payPeriodStart:null,payPeriodEnd:null}));await conflict(slip('b'));
});
test('E13 zero net and negative recovery remain valid payments',async()=>{
  await store.upsertRecord(slip('a',{netPay:0,grossPay:0}));
  await store.saveRecordSeparately(slip('b',{grossPay:-100,netPay:-60}));
  assert.equal((await analysis()).totalNet,-60);assert.equal((await analysis()).totalGross,-100);
});
test('E14 annual YTD is a latest snapshot, never a sum',async()=>{
  await store.upsertRecord(slip('a'));await store.upsertRecord(slip('b',{payDate:'2026-09-28',payPeriodStart:'2026-09-01',payPeriodEnd:'2026-09-15',ytdTaxableIncome:27000}));
  assert.equal((await analysis()).totalGross,6000);assert.equal((await analysis()).latestYtd,27000);
});
test('E15 December period paid in January belongs to payment year',async()=>{
  await store.upsertRecord(slip('a',{payDate:'2027-01-05',payPeriodStart:'2026-12-16',payPeriodEnd:'2026-12-31'}));
  assert.equal((await analysis()).payslips,0);assert.equal(buildYearAnalysis(await all(),2027).totalNet,1900);
});
test('E16 tax-card reset is not combined with old card accumulation',async()=>{
  await store.upsertRecord(slip('a'));await store.upsertRecord(slip('b',{payDate:'2026-09-28',payPeriodStart:'2026-09-01',payPeriodEnd:'2026-09-15',taxLimit:10000,taxCardAccumulatedIncome:3000,taxRate:25}));
  assert.equal(forecastTaxCardLimit(await all(),2026).remaining,7000);
});
test('E17 original PDF cannot overwrite manually corrected YTD',async()=>{
  const a=slip('a');await store.upsertRecord(a);
  await store.upsertRecord(applyUserCorrections(a,{ytdTaxableIncome:25000}));
  await store.upsertRecord(slip('reimport',{}, {sourceHash:a.sourceHash}));
  assert.equal((await analysis()).latestYtd,25000);assert.equal((await all()).length,2);
});
test('E18 old backups cannot reactivate replaced revisions',async()=>{
  const a=slip('a');await store.upsertRecord(a);const old=makeBackup(await all());
  await store.replaceRecord(a.id,slip('b',{netPay:1950}));await store.mergeManyRecords(parseBackup(old));
  assert.equal((await analysis()).totalNet,1950);assert.equal((await all()).length,2);
});
test('E19 repeated backup with same-ID differing content is idempotent and preserves both',async()=>{
  const a=slip('a'),b=slip('a',{netPay:1950},{sourceHash:null});await store.upsertRecord(a);
  await store.mergeManyRecords([b]);await store.mergeManyRecords([b]);
  assert.equal((await all()).length,2);assert.equal((await analysis()).totalNet,null);
});
test('E20 replacement chains survive every ancestor restore order',async()=>{
  const a=slip('a');await store.upsertRecord(a);const b=await store.replaceRecord(a.id,slip('b',{netPay:1950}));
  const c=await store.replaceRecord(b.id,slip('c',{netPay:2000}));
  for(const order of [[a,b,c],[c,b,a],[b,a,c]]) await store.mergeManyRecords(order);
  assert.equal((await analysis()).totalNet,2000);assert.equal((await all()).length,3);
});
test('E21 confirmed distinct decisions survive backup and restore',async()=>{
  await store.upsertRecord(slip('a'));await store.saveRecordSeparately(slip('b'));
  const backup=makeBackup(await all());await store.clearAllRecords();await store.mergeManyRecords(parseBackup(backup));
  assert.equal((await analysis()).totalNet,3800);
});
test('E22 unresolved conflict blocks annual certainty despite another clean month',async()=>{
  await store.mergeManyRecords([slip('a'),slip('b',{netPay:1950}),slip('c',{payDate:'2026-09-28',payPeriodStart:'2026-09-01',payPeriodEnd:'2026-09-15'})]);
  const r=await analysis();assert.equal(r.totalNet,null);assert.equal(r.latestYtd,null);assert.equal(r.months[8].net,1900);
});
test('E23 normalized backup retains opaque identity/decisions, excludes personal/raw fields',async()=>{
  await store.upsertRecord(slip('a',{}, {employeeName:'SYNTHETIC PRIVATE',rawText:'SYNTHETIC RAW'}));
  await store.saveRecordSeparately(slip('b'));const backup=makeBackup(await all());
  assert.ok(backup.records.every(r=>r.payEventId&&r.distinctFrom.length));assert.ok(!JSON.stringify(backup).includes('SYNTHETIC'));
  assert.deepEqual(parseBackup(backup).map(r=>r.distinctFrom),backup.records.map(r=>r.distinctFrom));
});
test('E24 concurrent imports and backup restore never lose or double-count a payment',async()=>{
  const a=slip('a'),b=slip('b',{payDate:'2026-09-28',payPeriodStart:'2026-09-01',payPeriodEnd:'2026-09-15'});
  await Promise.all([store.upsertRecord(a),store.upsertRecord(a),store.mergeManyRecords([b]),store.mergeManyRecords([b])]);
  assert.equal((await all()).length,2);assert.equal((await analysis()).totalNet,3800);
});
test('E25 unresolved and superseded records never supply calculator/tax-card defaults',async()=>{
  await store.mergeManyRecords([slip('a'),slip('b',{netPay:1950})]);
  assert.equal(forecastTaxCardLimit(await all(),2026).valid,false);assert.equal(deriveTaxDefaults(await all(),2026).limit,null);
});
test('E26 different payers use opaque separate payment IDs without payer names',async()=>{
  await store.upsertRecord(slip('a'));await store.saveRecordSeparately(slip('b'));
  const rows=await all();assert.notEqual(rows[0].payEventId,rows[1].payEventId);assert.equal((await analysis()).totalNet,3800);
});
test('stale dialog cannot replace a newer revision',async()=>{
  const a=slip('a');await store.upsertRecord(a);await store.replaceRecord(a.id,slip('b'));
  await assert.rejects(store.replaceRecord(a.id,slip('c'),[a]),e=>e.code==='PAY_EVENT_CONFLICT');
});
test('three candidates require explicit target; resolving one leaves other ambiguity visible',async()=>{
  await store.mergeManyRecords([slip('a'),slip('b',{netPay:1950}),slip('c',{netPay:2000})]);
  const incoming=slip('d',{netPay:2050});assert.equal(findRecordConflict(await all(),incoming).candidates.length,3);
  await store.replaceRecord('a',incoming,await all());assert.equal((await analysis()).totalNet,null);
});
test('divergent backup branches are retained and never arbitrarily selected',async()=>{
  const a=slip('a');await store.upsertRecord(a);const b=await store.replaceRecord('a',slip('b',{netPay:1950}));
  const c={...b,id:'branch-c',values:{...b.values,netPay:2000}};
  await store.mergeManyRecords([c]);assert.equal(projectPayroll(await all()).unresolved.length,2);assert.equal((await analysis()).totalNet,null);
});
test('unsupported schema rejects before mutation',async()=>{
  await store.upsertRecord(slip('a'));
  assert.throws(()=>parseBackup({...makeBackup([]),recordSchemaVersion:999}));
  await assert.rejects(store.mergeManyRecords([{...slip('b'),recordSchemaVersion:999}]));assert.equal((await all()).length,1);
});
test('identical-source backup rows have a usable resolution and can be replaced',async()=>{
  const a=slip('a'),b=slip('b',{}, {sourceHash:a.sourceHash});await store.mergeManyRecords([a,b]);
  const conflict=findRecordConflict(await all(),b,{ignoreRecordId:b.id});assert.ok(conflict);
  await store.replaceRecord(a.id,b,[a]);assert.equal((await analysis()).totalNet,1900);
});
test('a stored divergent revision can be split into a distinct event and survive restore',async()=>{
  const a=slip('a'),b=slip('b',{netPay:1950},{payEventId:a.payEventId});await store.mergeManyRecords([a,b]);
  const result=await store.saveRecordSeparately(b,[a]);assert.notEqual(result.payEventId,a.payEventId);
  assert.equal((await analysis()).totalNet,3850);await store.mergeManyRecords([a,b]);assert.equal((await analysis()).totalNet,3850);
});
test('reverting the last manual correction persists an equal-content new revision',async()=>{
  const a=slip('a');await store.upsertRecord(a);
  const b=(await store.upsertRecord(applyUserCorrections(a,{ytdTaxableIncome:25000}))).record;
  await store.upsertRecord(applyUserCorrections(b,{ytdTaxableIncome:24000}));
  assert.equal((await analysis()).latestYtd,24000);const backup=makeBackup(await all());
  await store.clearAllRecords();await store.mergeManyRecords(parseBackup(backup));
  assert.equal((await analysis()).latestYtd,24000);assert.equal((await all()).length,3);
});
test('equal-content successor and superseded ancestor remain separate backup revisions',async()=>{
  const a=slip('a'),c={...a,id:'successor',supersedes:['a'],resolution:'active'};
  await store.mergeManyRecords([{...a,resolution:'superseded'},c]);
  assert.equal((await all()).length,2);assert.equal((await analysis()).totalNet,1900);
});
test('backup collision remaps lineage without hiding unrelated local history in either order',async()=>{
  for(const reverse of [false,true]) {
    await store.clearAllRecords();
    const local=slip('collision',{netPay:100},{sourceHash:null});await store.upsertRecord(local);
    const ancestor={...local,resolution:'superseded',values:{...local.values,netPay:200}};
    const head={...local,id:'newer',supersedes:['collision'],values:{...local.values,netPay:300}};
    const incoming=reverse?[head,ancestor]:[ancestor,head];
    await store.mergeManyRecords(incoming);await store.mergeManyRecords(incoming);
    const result=projectPayroll(await all());
    assert.equal((await all()).length,3);assert.equal(result.unresolved.length,2);
    assert.ok(result.visible.some(r=>r.id==='collision'&&r.values.netPay===100));
    assert.equal((await analysis()).totalNet,null);
  }
});
test('a missing payment date can be corrected without losing the original row',async()=>{
  const a=slip('a',{payDate:null});await store.upsertRecord(a);
  assert.equal(projectPayroll(await all()).unresolved.length,1);
  await store.upsertRecord(applyUserCorrections(a,{payDate:'2026-08-28'}));
  assert.equal((await analysis()).totalNet,1900);assert.equal((await all()).length,2);
});
test('negative recovery is accepted by the existing parser validation gate',async()=>{
  const {validate}=await import('../parser.js');
  const fields={grossPay:{value:-100},netPay:{value:-60},ytdTaxableIncome:{value:23900}};
  assert.equal(validate(fields).filter(n=>n.level==='blocking').length,0);
  assert.ok(validate({grossPay:{value:100},netPay:{value:200}}).some(n=>n.code==='net-greater-than-gross'));
});
test('legacy flat records with colliding generated IDs preserve differing values on repeated restore',async()=>{
  const flat={payDate:'2026-08-28',payPeriodStart:'2026-08-01',payPeriodEnd:'2026-08-15',grossPay:3000,netPay:1900,ytdTaxableIncome:24000};
  const records=[migrateLegacyRecord({...flat,withholdingPeriod:-800}),migrateLegacyRecord({...flat,withholdingPeriod:-750})];
  await store.mergeManyRecords(records);await store.mergeManyRecords(records);await store.mergeManyRecords([...records].reverse());
  assert.equal((await all()).length,2);assert.equal((await analysis()).totalNet,null);
});
test('incomplete or cyclic backup lineage cannot silently shadow active local history',async()=>{
  const a=slip('a');await store.upsertRecord(a);
  await assert.rejects(store.mergeManyRecords([{...slip('b'),supersedes:['a']}]),/puuttuu/);
  await assert.rejects(store.mergeManyRecords([{...slip('c'),supersedes:['c']}]),/kehän/);
  assert.equal((await all()).length,1);assert.equal((await analysis()).totalNet,1900);
});
test('reimporting a known PDF after a separate payment never opens a new-payment conflict',async()=>{
 const a=slip('a'),b=slip('b');await store.upsertRecord(a);await store.saveRecordSeparately(b,[a]);
 const incoming=slip('repeat',{}, {sourceHash:a.sourceHash});
 assert.equal(findRecordConflict(await all(),incoming),null);
 await store.upsertRecord(incoming);assert.equal((await analysis()).totalNet,3800);assert.equal((await all()).length,2);
});
