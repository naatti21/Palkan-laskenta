import { referenceNet2026 } from '../beta-net-reference-2026.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseDisplayedEuro,parseWeekendCount,summaryBreakdown,cashFlowDifference,calculateTaxKnee,referenceWeekendAnalysis} from '../beta-ab-summary-model.mjs';

const html=readFileSync(new URL('../experiments/year-planner/index.html',import.meta.url),'utf8');
const context={};
vm.runInNewContext(html.match(/<script id="planner-core">([\s\S]*?)<\/script>/)[1],context);
const {computePlan}=context.PalkkaPlannerCore;
const inputs={weekends:2,sat:8,sun:8,baseGross:52000,holiday:0,bonus:0,other:0,
  raise:0,raiseMonth:1,weekendGross:1000,hourlyRate:20,ktaRate:20,
  weekendMethod:'manual',rulesConfirmed:false,limitA:62000,limitB:72000,
  rateA:30,rateB:33,extraA:48,extraB:48,otherDeductions:10};

test('Finnish displayed money retains decimals, signs and unavailable values',()=>{
  for(const value of ['1 234,56 €','1\u00a0234,56 €','1\u202f234,56 €'])assert.equal(parseDisplayedEuro(value),1234.56);
  assert.equal(parseDisplayedEuro('−12,50 €'),-12.5);
  assert.equal(parseDisplayedEuro('0 €'),0);
  for(const value of [undefined,'','–','arvio 20 €','NaN','1,2,3 €'])assert.equal(parseDisplayedEuro(value),null);
});
test('weekend validation preserves zero and rejects incomplete/fractional/out-of-range input',()=>{
  for(const n of [0,2,52])assert.equal(parseWeekendCount(String(n)),n);
  for(const n of ['', ' ', undefined, -1, 53, 1.5, 'NaN'])assert.equal(parseWeekendCount(n),null);
});
test('independent A/B counts preserve known cash flow without mutating input',()=>{
  const snapshot=structuredClone(inputs);
  const result=summaryBreakdown(inputs,'2','10',computePlan);
  assert.equal(result.rowA.gross,54000);
  assert.equal(result.rowA.netA,32400);
  assert.equal(result.rowB.gross,62000);
  assert.equal(result.rowB.netB,35340);
  assert.deepEqual(inputs,snapshot);
});
test('all weekend combinations and threshold crossings use unchanged planner rows',()=>{
  const expected=computePlan({...inputs,weekends:52});
  for(const a of [0,2,10,11,20,21,52])for(const b of [0,2,10,11,20,21,52]){
    const state=summaryBreakdown(inputs,String(a),String(b),computePlan);
    assert.deepEqual(state.rowA,expected.series[a]);
    assert.deepEqual(state.rowB,expected.series[b]);
    assert.deepEqual(state.reference,expected.series[2]);
    const parts=cashFlowDifference(state.rowA,state.rowB);
    assert.ok(Math.abs(parts.workloadPart+parts.withholdingPart-(state.rowA.netA-state.rowB.netB))<1e-8);
    if(a===b)assert.equal(parts.workloadPart,0);
  }
});
test('missing inputs or failing/unavailable planner never produce a summary',()=>{
  assert.equal(summaryBreakdown(inputs,'','2',computePlan),null);
  assert.equal(summaryBreakdown({...inputs,weekends:null},'2','2',computePlan),null);
  assert.equal(summaryBreakdown({...inputs,baseGross:null},'2','2',computePlan),null);
  assert.equal(summaryBreakdown({...inputs,rateA:Infinity},'2','2',computePlan),null);
  assert.equal(summaryBreakdown(inputs,'2','2',undefined),null);
  assert.equal(summaryBreakdown(inputs,'2','2',()=>{throw Error('invalid');}),null);
});


test('C shows independently calculated A/B thresholds and source numbers',()=>{
  const planned=computePlan({...inputs,weekends:52});
  const c=calculateTaxKnee(planned.series,inputs);
  assert.deepEqual({n:c.n,card:c.card,stepAt:c.stepAt,free:c.free},
    {n:10,card:'A',stepAt:11,free:42});
  assert.equal(c.baseline,52000);
  assert.equal(c.grossPerWeekend,1000);
  assert.equal(c.cards.A.limit,62000);
  assert.equal(c.cards.A.n,10);
  assert.equal(c.cards.A.gross,62000);
  assert.equal(c.cards.A.nextGross,63000);
  assert.equal(c.cards.A.baseRate,30);
  assert.equal(c.cards.A.extraRate,48);
  assert.equal(c.cards.B.n,20);
  assert.equal(c.cards.B.limit,72000);
  assert.equal(Math.round(c.gainBefore),600);
  assert.equal(Math.round(c.gainAfter),420);
  assert.equal(Math.round(c.net),37200);
  // A/B selected counts do not set C. Underlying gross/limits do.
  assert.equal(inputs.weekends,2);
});
test('C actually reacts to changed annual pay, weekend gross and tax limits',()=>{
  const base={...inputs,baseGross:65000,limitA:77000,limitB:100000};
  const make=(change={})=>{
    const config={...base,...change};
    return calculateTaxKnee(computePlan({...config,weekends:52}).series,config);
  };
  assert.equal(make().n,12);
  assert.equal(make().cards.A.n,12);
  assert.equal(make().cards.B.n,35);
  assert.equal(make({baseGross:70000}).n,7);
  assert.equal(make({baseGross:70000,weekendGross:2000}).n,3);
  assert.equal(make({limitA:200000}).n,35);
  assert.equal(make({limitA:200000}).card,'B');
  assert.equal(make({extraA:30}).n,35); // A tax threshold does not lower marginal gain
  const neither=make({limitA:200000,limitB:210000});
  assert.equal(neither.found,false);
  assert.equal(neither.cards.A.reason,'no-crossing');
  assert.equal(neither.cards.B.reason,'no-crossing');
});
test('C does not splice tax cards together and excludes invalid/flat scenarios',()=>{
  const original=computePlan({...inputs,weekends:52}).series;
  const switcher={...inputs,limitA:62000,limitB:63000,rateA:10,rateB:30,extraA:60,extraB:35};
  const model=computePlan({...switcher,weekends:52}).series;
  const knee=calculateTaxKnee(model,switcher);
  assert.equal(knee.cards.A.n,10);
  assert.equal(knee.cards.B.n,11);
  assert.equal(knee.n,10);
  assert.equal(knee.gainBefore,
    model[knee.n].netA-model[knee.n-1].netA);
  assert.equal(knee.gainAfter,
    model[knee.n+1].netA-model[knee.n].netA);
  for(const bad of [null,[],original.slice(1),original.map((row,i)=>i===7?{...row,netA:NaN}:row)])
    assert.equal(calculateTaxKnee(bad,inputs),null);
  assert.equal(calculateTaxKnee(original,{...inputs,rateA:NaN}),null);
  assert.deepEqual(original,computePlan({...inputs,weekends:52}).series);
});


test('public C reference finds actual net-retention drop from 35k without imposing 12 weekends',()=>{
  const c={...inputs,baseGross:35000,weekendGross:1000};
  const series=computePlan({...c,weekends:52}).series;
  const ref=referenceWeekendAnalysis(series,referenceNet2026,2026);
  assert.equal(ref.available,true);
  assert.equal(ref.knee.n,5);
  assert.equal(Math.round(ref.knee.beforeGain),595);
  assert.equal(Math.round(ref.knee.afterGain),522);
  assert.equal(ref.perWeekend,1000);
  assert.equal(ref.points[12].gross,47000);
  const high={...inputs,baseGross:65000};
  const flat=referenceWeekendAnalysis(computePlan({...high,weekends:52}).series,referenceNet2026,2026);
  assert.equal(flat.available,true);
  assert.equal(flat.knee,null);
});

test('C never silently uses 2026 public tax reference for 2027 or extrapolates unavailable gross',()=>{
  const series=computePlan({...inputs,weekends:52}).series;
  const wrongYear=referenceWeekendAnalysis(series,referenceNet2026,2027);
  assert.equal(wrongYear.available,false);
  assert.equal(wrongYear.reason,'year');
  const outside=referenceWeekendAnalysis(
    computePlan({...inputs,baseGross:180000,weekends:52}).series,referenceNet2026,2026);
  assert.equal(outside.available,false);
  assert.equal(outside.reason,'range');
  assert.equal(referenceWeekendAnalysis([],referenceNet2026,2026),null);
});
