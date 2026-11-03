import {test,expect} from '@playwright/test';
test('issue41: real IndexedDB locks serialize simultaneous tabs importing one source',async({page,context})=>{
 await page.goto('/');const other=await context.newPage();await other.goto('/');
 const inject=async p=>p.evaluate(async()=>{
  const s=await import('/storage.js');const m=await import('/model.js');
  const record=m.migrateLegacyRecord({recordSchemaVersion:2,id:crypto.randomUUID(),payEventId:crypto.randomUUID(),sourceHash:'a'.repeat(64),values:{payDate:'2026-10-30',payPeriodStart:'2026-10-01',payPeriodEnd:'2026-10-15',grossPay:2000,netPay:1400,ytdTaxableIncome:20000}});
  return s.upsertRecord(record);
 });
 const result=await Promise.all([inject(page),inject(other)]);
 expect(result.filter(r=>r.mergedDuplicate)).toHaveLength(1);
 expect(await page.evaluate(async()=>{const s=await import('/storage.js');return (await s.getAllRecords()).length;})).toBe(1);
 await page.reload();
 expect(await page.evaluate(async()=>{const s=await import('/storage.js');return (await s.getAllRecords())[0].values.netPay;})).toBe(1400);
});
test('issue41: rejected cyclic restore in Chromium retains the prior active salary after reload',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const s=await import('/storage.js'),m=await import('/model.js');
  const row=id=>m.migrateLegacyRecord({recordSchemaVersion:2,id,payEventId:'event',values:{payDate:'2026-10-30',grossPay:2000,netPay:1400}});
  const a={...row('a'),resolution:'superseded'},b={...row('b'),supersedes:['a'],resolution:'superseded'},c={...row('c'),supersedes:['a','b']};
  await s.mergeManyRecords([a,b,c]);const before=await s.getAllRecords();
  let rejected=false;try{await s.mergeManyRecords([{...a,supersedes:['b']}]);}catch{rejected=true;}
  return {rejected,unchanged:JSON.stringify(before)===JSON.stringify(await s.getAllRecords())};
 });
 expect(result).toEqual({rejected:true,unchanged:true});await page.reload();
 expect(await page.evaluate(async()=>{const s=await import('/storage.js'),m=await import('/model.js');return m.projectPayroll(await s.getAllRecords()).active.map(r=>r.id);})).toEqual(['c']);
});
