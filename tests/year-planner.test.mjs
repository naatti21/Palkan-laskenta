import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../experiments/year-planner/index.html",import.meta.url),"utf8");
const script=html.match(/<script id="planner-core">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,"inline model exists");
const context={};
vm.runInNewContext(script,context);
const calculate=context.PalkkaPlannerCore.computePlan;
const c={weekends:11,sat:8,sun:8,baseGross:52000,holiday:3000,bonus:0,other:0,raise:2,raiseMonth:3,weekendGross:1100,limitA:77000,limitB:100000,rateA:30,rateB:33,extraA:48,extraB:48,otherDeductions:10};

test("zero weekends preserves baseline and all weekends free",()=>{
  const r=calculate({...c,weekends:0});
  assert.equal(r.hours,0);assert.equal(r.free,52);assert.equal(r.current.gross,r.baseline);
});
test("52 weekends and 8+8 hours work",()=>{
  const r=calculate({...c,weekends:52});
  assert.equal(r.hours,832);assert.equal(r.free,0);
  assert.ok(r.series.every((p,i)=>i===0||p.gross>=r.series[i-1].gross));
});
test("holiday and APP included once, raise applies only to base",()=>{
  const a=calculate({...c,weekends:0});
  const b=calculate({...c,weekends:0,bonus:4800});
  assert.ok(Math.abs(a.baseline-(52000*(1+.02*10/12)+3000))<.001);
  assert.ok(Math.abs(b.baseline-a.baseline-4800)<.001);
});
test("variable working hours scale illustrative extra gross",()=>{
  const r=calculate({...c,weekends:1,sun:0});
  assert.equal(r.grossPerWeekend,550);assert.equal(r.hours,8);
});
test("77k crossing and 100k crossing are weekend-specific",()=>{
  const r=calculate({...c,baseGross:76000,holiday:0,raise:0,weekendGross:1000});
  assert.equal(r.crossA,2);assert.equal(r.crossB,25);
});
test("existing excess returns zero; equality crosses next weekend",()=>{
  assert.equal(calculate({...c,baseGross:90000,holiday:0,raise:0}).crossA,0);
  assert.equal(calculate({...c,baseGross:77000,holiday:0,raise:0}).crossA,1);
});
test("with no additional gross, no later threshold is invented",()=>{
  const r=calculate({...c,weekendGross:0,raise:0,holiday:0});
  assert.equal(r.crossA,null);
});
test("net weekend increment changes at tax-card withholding threshold",()=>{
  const r=calculate({...c,baseGross:76000,holiday:0,raise:0,weekendGross:1000});
  assert.ok(Math.abs(r.series[1].gainA-600)<1e-6);
  assert.ok(Math.abs(r.series[3].gainA-420)<1e-6);
});
test("same gross under both cards and different withholding outcomes",()=>{
  const r=calculate(c);
  assert.ok(r.current.netA!==r.current.netB);
  assert.equal(r.series.length,53);
});
test("invalid deductions, negative data and fractional weekends rejected",()=>{
  assert.throws(()=>calculate({...c,otherDeductions:20,rateA:90}),/eivät voi/);
  assert.throws(()=>calculate({...c,bonus:-1}),/virheellinen/);
  assert.throws(()=>calculate({...c,weekends:2.5}),/kokonaisluku/);
});