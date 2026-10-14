import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../experiments/year-planner/index.html',import.meta.url),'utf8');
const h=html.match(/<script id="planner-history-core">([\s\S]*?)<\/script>/)?.[1];
const c=html.match(/<script id="planner-core">([\s\S]*?)<\/script>/)?.[1];
assert.ok(h,'history parser included');assert.ok(c,'planner core included');
const ctx={};vm.runInNewContext(h,ctx);vm.runInNewContext(c,ctx);
const suggest=ctx.PalkkaPlannerHistory.historySuggestions;
const plan=ctx.PalkkaPlannerCore.computePlan;
const mk=(n,more=[])=>({
  kind:'payslip',
  values:{payDate:`2026-0${n}-10`,payPeriodStart:`2026-0${n}-01`,payPeriodEnd:`2026-0${n}-09`,grossPay:3200,ytdTaxableIncome:3200*n,kta:25.07},
  payLines:[{code:'13001',label:'Palkkiotyö',amount:1555.2,quantity:80,unitPrice:19.44},
    {code:'13101',label:'Tuotantopalkkio',amount:414.4,quantity:80,unitPrice:5.18},
    {code:'90100',amount:-233.6},{code:'90200',amount:-28.48},{code:'90400',amount:-32},{code:'90920',amount:-41.6},...more]
});
const payload={app:'Palkka PWA',backupSchemaVersion:2,recordSchemaVersion:1,
  records:[mk(1),mk(2,[{code:'55301',amount:1500}]),mk(3,[{code:'40000',amount:1000}])]};
const scenario={weekends:11,sat:8,sun:8,baseGross:52000,holiday:3000,bonus:0,other:0,raise:2,raiseMonth:3,
  weekendGross:1100,weekendMethod:'paylines',hourlyRate:24.62,ktaRate:25.07,
  limitA:77000,limitB:100000,rateA:30,rateB:33,extraA:48,extraB:48,otherDeductions:10};

test('history suggests payline wage and KTA from local records',()=>{
  const r=suggest(payload);assert.equal(r.records,3);assert.equal(r.ktaRate,25.07);
  assert.ok(Math.abs(r.avgHourlyRate-24.62)<1e-8);
});
test('holiday and APP classified once and never included in hourly wage',()=>{
  const r=suggest(payload);assert.equal(r.holiday,1500);assert.equal(r.bonus,1000);
  assert.equal(r.baseEstimate,51200);
});
test('latest YTD is a snapshot, not a sum',()=>{assert.equal(suggest(payload).latestYtd,9600);});
test('missing KTA stays null, no false precision',()=>{
  const items=payload.records.map(r=>({...r,values:{...r.values,kta:null}}));
  assert.equal(suggest({...payload,records:items}).ktaRate,null);
});
test('no supporting pay lines are not treated as zero earnings',()=>{
  const r=suggest({...payload,records:[{...mk(1),payLines:[]}]});
  assert.equal(r.avgHourlyRate,null);assert.equal(r.holiday,null);
});
test('conflicting payment events are excluded',()=>{
  const r=suggest({...payload,records:[...payload.records,mk(1)]});
  assert.equal(r.excludedConflicts,2);assert.equal(r.records,2);
});
test('malformed foreign backups and invalid weekly hours fail closed',()=>{
  assert.throws(()=>suggest({app:'Other',records:[]}));
  assert.throws(()=>suggest(payload,0));
});
test('8 + 8h payline profile produces 1095.88 gross',()=>{
  assert.ok(Math.abs(plan(scenario).grossPerWeekend-1095.88)<.001);
});
test('20h Sat/Sun split affects gross even at identical hours',()=>{
  const a=plan({...scenario,sat:10,sun:10}).grossPerWeekend;
  const b=plan({...scenario,sat:8,sun:12}).grossPerWeekend;
  assert.ok(Math.abs(a-1394.92)<.001);assert.ok(Math.abs(b-1495.20)<.001);assert.ok(b>a);
});
test('manual gross mode still uses original arithmetic',()=>{
  assert.equal(plan({...scenario,weekendMethod:'manual',sat:10,sun:10}).grossPerWeekend,1375);
});
test('missing KTA blocks payline calculation, manual remains usable',()=>{
  assert.throws(()=>plan({...scenario,ktaRate:0}),/KTA/);
  assert.doesNotThrow(()=>plan({...scenario,weekendMethod:'manual',ktaRate:0}));
});
test('zero to 52 weekend path and both tax-card outcomes preserved',()=>{
  const r=plan({...scenario,weekends:52});
  assert.equal(r.series.length,53);assert.equal(r.free,0);
  assert.ok(r.current.netA!==r.current.netB);
});
test('import UI hides native missing filename and reports loaded state',()=>{
  assert.ok(html.includes('id="filePickerTitle"'));
  assert.ok(html.includes('Varmuuskopio luettu onnistuneesti'));
  assert.ok(html.includes('id="weekendBreakdown"'));
  assert.ok(html.includes('.file-picker input{position:absolute;opacity:0'));
});
