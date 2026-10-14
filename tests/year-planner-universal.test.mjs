import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../experiments/year-planner/index.html",import.meta.url),"utf8");
const historyJs=html.match(/<script id="planner-history-core">([\s\S]*?)<\/script>/)?.[1];
const planJs=html.match(/<script id="planner-core">([\s\S]*?)<\/script>/)?.[1];
assert.ok(historyJs&&planJs,"Embedded pure models exist");
const context={};vm.runInNewContext(historyJs,context);vm.runInNewContext(planJs,context);
const suggest=context.PalkkaPlannerHistory.historySuggestions;
const compute=context.PalkkaPlannerCore.computePlan;
const pay=(month,lines,day="09",kta=24)=>({
  kind:"payslip",values:{payDate:"2026-"+String(month).padStart(2,"0")+"-"+day,
  payPeriodStart:"2026-"+String(month).padStart(2,"0")+"-01",
  payPeriodEnd:"2026-"+String(month).padStart(2,"0")+"-08",grossPay:3400,netPay:2300,
  ytdTaxableIncome:3400*month,kta},
  payLines:lines
});
const monthly=[1,2,3].map(m=>pay(m,[{label:"Kuukausipalkka",amount:3500}],m===2?"09":"10"));
const hourly=[1,2,3].map(m=>pay(m,[{code:"13001",label:"Palkkiotyö",quantity:80,amount:1600},
  {code:"13101",label:"Tuotantopalkkio",quantity:80,amount:400}]));
const backup=records=>({app:"Palkka PWA",backupSchemaVersion:2,recordSchemaVersion:1,records});
test("monthly salary uses twelve months, not 26 biweekly wage events",()=>{
  const r=suggest(backup(monthly));assert.equal(r.wageModel,"monthly");
  assert.equal(r.baseEstimate,42000);assert.equal(r.avgHourlyRate,null);
  assert.equal(r.monthlyRate,3500);
});
test("hourly wage plus separate production premium uses observed rate",()=>{
  const r=suggest(backup(hourly),40);assert.equal(r.wageModel,"hourly");
  assert.equal(r.baseEstimate,52000);assert.equal(r.avgHourlyRate,25);
});
test("ordinary hourly wage can be recognized without production premium",()=>{
  const rows=[1,2,3].map(m=>pay(m,[{label:"Tuntipalkka",quantity:80,amount:2000}]));
  const r=suggest(backup(rows),37.5);
  assert.equal(r.wageModel,"hourly");assert.equal(r.baseEstimate,48800);
});
test("unknown or conflicting salary models never invent a base salary",()=>{
  assert.equal(suggest(backup([pay(1,[]),pay(2,[]),pay(3,[])])).baseEstimate,null);
  const mixed=backup([...hourly,...monthly.map((v,i)=>({...v,values:{...v.values,payDate:"2026-0"+(i+4)+"-10"}}))]);
  const r=suggest(mixed);
  assert.equal(r.wageModel,"unknown");assert.equal(r.baseEstimate,null);
});
test("unverified bonus and holiday rows remain optional",()=>{
  const rows=hourly.map((v,i)=>({...v,payLines:[
    ...v.payLines,...(i===1?[{label:"Tulospalkkio",amount:850},{label:"Lomaraha",amount:270}]:[])
  ]}));
  const r=suggest(backup(rows));assert.equal(r.bonus,850);assert.equal(r.holiday,270);
});
const scene={weekends:2,sat:8,sun:8,baseGross:42000,holiday:0,bonus:0,other:0,
 raise:0,raiseMonth:1,weekendGross:500,hourlyRate:25,ktaRate:25,
 limitA:60000,limitB:80000,rateA:30,rateB:32,extraA:45,extraB:45,otherDeductions:8};
test("regular manually supplied weekend gross is valid",()=>{
  const result=compute({...scene,weekendMethod:"manual"});
  assert.equal(result.grossPerWeekend,500);assert.equal(result.current.gross,43000);
});
test("special TES model cannot run without user confirmation",()=>{
  assert.throws(()=>compute({...scene,weekendMethod:"paylines",rulesConfirmed:false}),/Vahvista/);
  const confirmed=compute({...scene,weekendMethod:"paylines",rulesConfirmed:true});
  assert.ok(confirmed.grossPerWeekend>500);
});
test("unfilled weekend estimate is not treated as a zero-pay prediction",()=>{
  assert.throws(()=>compute({...scene,weekendGross:0,weekendMethod:"manual"}),/Anna viikonlopun/);
  assert.doesNotThrow(()=>compute({...scene,weekends:0,weekendGross:0}));
});
test("unknown record year and duplicate payroll events fail conservatively",()=>{
  assert.throws(()=>suggest(backup([])),/palkkalaskelmia/);
  const r=suggest(backup([...hourly,hourly[0]]));
  assert.equal(r.excludedConflicts,2);
});
test("UI explicitly marks user-confirmed TES and bonus optional, keeps full comparison",()=>{
 assert.ok(html.includes('id="rulesConfirmed"'));
 assert.ok(html.includes('id="planYear"'));
 assert.ok(html.includes('id="allSamples"'));
 assert.ok(html.includes('id="wageModelNote"'));
});
