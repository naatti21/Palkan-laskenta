import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseDisplayedEuro,parseWeekendCount,summaryBreakdown,cashFlowDifference} from '../beta-ab-summary-model.mjs';

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
