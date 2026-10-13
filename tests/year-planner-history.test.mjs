import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../experiments/year-planner/index.html',import.meta.url),'utf8');
const source=html.match(/<script id="planner-history-core">([\s\S]*?)<\/script>/)?.[1];
assert.ok(source,'History calculator included');
const context={};vm.runInNewContext(source,context);
const suggest=context.PalkkaPlannerHistory.historySuggestions;
const row=(date,gross,ytd,lines,start=date)=>({kind:'payslip',values:{payDate:date,payPeriodStart:start,payPeriodEnd:date,grossPay:gross,ytdTaxableIncome:ytd},payLines:lines});
const wage=(hourly=20,bonus=5,hrs=80)=>[{code:'13001',label:'Palkkiotyö',quantity:hrs,amount:hourly*hrs},{code:'13101',label:'Tuotantopalkkio',quantity:hrs,amount:bonus*hrs}];
const deductions=[{code:'90100',amount:-240},{code:'90200',amount:-28},{code:'90400',amount:-30},{code:'90920',amount:-39}];
const records=[
 row('2026-01-09',2800,2800,[...wage(),...deductions]),
 row('2026-03-01',3500,6300,[...wage(20,6),{code:'55201',label:'Lomaraha',amount:300},...deductions]),
 row('2026-04-10',4800,11100,[{code:'40000',label:'Bonus APP',amount:2700},{code:'40070',amount:400},...deductions]),
 row('2026-08-10',4400,15500,[...wage(21,5),{code:'55301',label:'Lomaraha',amount:1200},...deductions]),
 row('2025-10-10',2600,70000,[...wage()])
];
const payload={app:'Palkka PWA',backupSchemaVersion:2,recordSchemaVersion:2,records};
test('history selects latest payment year and rejects accidental previous-year mixing',()=>{const r=suggest(payload);assert.equal(r.year,2026);assert.equal(r.records,4);assert.equal(r.latestYtd,15500);});
test('holiday bonus totals paid lines exactly once, no YTD summing',()=>assert.equal(suggest(payload).holiday,1500));
test('APP kept separate from one-off compensation and is not auto-projected',()=>{const r=suggest(payload);assert.equal(r.bonus,2700);assert.equal(r.other,400);});
test('per-hour baseline uses paired regular pay and production premium, never overtime supplement',()=>{const r=suggest(payload);assert.equal(r.baseEstimate,Math.round(26*40*52/100)*100);assert.equal(r.rateSamples,3);});
test('last fully-evidenced nonwithholding deductions are suggested, but not a new-year tax rate',()=>{const r=suggest(payload);assert.ok(r.deductionsRate>0&&r.deductionsRate<20);assert.equal('rateA' in r,false);});
test('duplicate same payment event blocks both conflicting versions rather than doubling earnings',()=>{const duplicate={...payload,records:[...payload.records,JSON.parse(JSON.stringify(records[0]))]};const r=suggest(duplicate);assert.equal(r.excludedConflicts,2);assert.equal(r.records,3);});
test('missing pay line evidence is missing, not a fabricated zero or a baseline',()=>{const r=suggest({...payload,records:[row('2026-01-09',2000,2000,[])]});assert.equal(r.holiday,null);assert.equal(r.bonus,null);assert.equal(r.baseEstimate,null);});
test('rejects unrelated or malformed JSON and impossible weekly hours',()=>{assert.throws(()=>suggest({app:'Other',backupSchemaVersion:1,recordSchemaVersion:1,records:[]}));assert.throws(()=>suggest({...payload,records:[]}));assert.throws(()=>suggest(payload,0));});
test('skips corrections to production line so hourly rate is not inflated',()=>{const r=suggest({...payload,records:[row('2026-09-01',3200,3200,[...wage(),{code:'13101',label:'Korjaus',quantity:80,amount:2000}])]});assert.equal(r.avgHourlyRate,25);});