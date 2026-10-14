import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../experiments/year-planner/index.html',import.meta.url),'utf8');
const script=html.match(/<script id="planner-core">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'planner-core is available');
const context={};vm.runInNewContext(script,context);
const {computePlan,netDifferenceAnalysis}=context.PalkkaPlannerCore;
const points=values=>values.map((diff,n)=>({n,netA:10000+diff,netB:10000}));

test('positive A lead: identifies peak, first decline and switch to B',()=>{
  const a=netDifferenceAnalysis(points([200,400,600,550,300,-50]));
  assert.equal(a.leader,'A');assert.equal(a.peak.n,2);
  assert.equal(a.decline.n,3);assert.equal(a.lost.n,5);assert.equal(a.reversal.n,5);
  assert.deepEqual(Array.from(a.data,p=>p.difference),[200,400,600,550,300,-50]);
});
test('plateau does not count as declining until it really drops',()=>{
  const a=netDifferenceAnalysis(points([200,400,400,400,390]));
  assert.equal(a.peak.n,1);assert.equal(a.decline.n,4);
});
test('initial B lead works symmetrically and switches to A',()=>{
  const a=netDifferenceAnalysis(points([-200,-300,-100,30]));
  assert.equal(a.leader,'B');assert.equal(a.peak.n,1);
  assert.equal(a.decline.n,2);assert.equal(a.reversal.n,3);
});
test('equal cards remain neutral, with no invented peak',()=>{
  const a=netDifferenceAnalysis(points([0,0,0,0]));
  assert.equal(a.leader,null);assert.equal(a.peak,null);assert.equal(a.decline,null);
});
test('no decline or reversal is reported if lead keeps increasing',()=>{
  const a=netDifferenceAnalysis(points([0,10,10,20]));
  assert.equal(a.leader,'A');assert.equal(a.peak.n,3);
  assert.equal(a.decline,null);assert.equal(a.lost,null);assert.equal(a.reversal,null);
});
test('neutral before positive lead and equality between reversal are handled',()=>{
  const a=netDifferenceAnalysis(points([0,0,100,100,0,-100]));
  assert.equal(a.peak.n,2);assert.equal(a.decline.n,4);
  assert.equal(a.lost.n,4);assert.equal(a.reversal.n,5);
});
test('rejects malformed or nonfinite series',()=>{
  assert.throws(()=>netDifferenceAnalysis([]));
  assert.throws(()=>netDifferenceAnalysis([{n:0,netA:NaN,netB:3}]));
  assert.throws(()=>netDifferenceAnalysis([{n:0.2,netA:20,netB:10}]));
});
test('integration with the original 0–52 weekend plan shows actual bend after earlier A limit',()=>{
  const r=computePlan({weekends:13,sat:8,sun:8,baseGross:50000,holiday:0,bonus:0,other:0,
   raise:0,raiseMonth:1,weekendGross:1000,weekendMethod:'manual',limitA:55000,limitB:65000,
   rateA:30,rateB:34,extraA:48,extraB:48,otherDeductions:10});
  const diff=netDifferenceAnalysis(r.series);
  assert.equal(diff.data.length,53);
  assert.equal(diff.leader,'A');
  assert.equal(diff.peak.n,5);
  assert.equal(diff.decline.n,6);
  assert.ok(Math.abs(diff.data[0].difference-2000)<1e-6);
  assert.ok(Math.abs(diff.peak.difference-2200)<1e-6);
  assert.ok(diff.data[15].difference<diff.peak.difference);
  assert.equal(r.series[13].gross,63000);
});
test('zero difference includes baseline, rather than hiding initial cash-flow advantage',()=>{
 const r=computePlan({weekends:0,sat:8,sun:8,baseGross:50000,holiday:0,bonus:0,other:0,
   raise:0,raiseMonth:1,weekendGross:1000,weekendMethod:'manual',limitA:55000,limitB:65000,
   rateA:30,rateB:34,extraA:48,extraB:48,otherDeductions:10});
 const diff=netDifferenceAnalysis(r.series);
 assert.equal(diff.data[0].difference,2000);
 assert.equal(diff.data[52].n,52);
});
test('chart is accessible and includes a zero reference and selected/peak summary',()=>{
  assert.ok(html.includes('id="netDifferenceChart"'));
  assert.ok(html.includes('id="netDifferenceSummary"'));
  assert.ok(html.includes('showZero:true'));
  assert.match(html,/ei eroa lopullisissa veroissa/);
  assert.match(html,/Kuvaaja näyttää ennakonpidätyksen mukaisen/);
});
