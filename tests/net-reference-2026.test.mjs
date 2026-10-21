import { test } from 'node:test';
import assert from 'node:assert/strict';
import {referenceNet2026,REFERENCE_YEAR} from '../beta-net-reference-2026.mjs';

test('2026 benchmark returns documented 52k gross / net and effective total deductions',()=>{
  assert.equal(REFERENCE_YEAR,2026);
  const x=referenceNet2026(52000);
  assert.equal(x.net,36363);
  assert.equal(Math.round(x.net/12),3030);
  assert.equal(Math.round(x.net/26),1399);
  assert.equal(Math.round(x.effectiveAllInPercent*10)/10,30.1);
  assert.equal(x.interpolated,false);
});

test('net interpolation is monotone and labels non-tabulated values',()=>{
  const g=51100;
  const x=referenceNet2026(g);
  assert.equal(x.net,35904.9);
  assert.equal(x.interpolated,true);
  assert.ok(referenceNet2026(70000).net>referenceNet2026(52000).net);
  assert.equal(referenceNet2026(70000).net-referenceNet2026(52000).net,8822);
});

test('never extrapolates an unverified 2026 tax rate outside reference interval',()=>{
  for(const invalid of [null,0,-1,19000,200000,Infinity,NaN,NaN]){
    assert.equal(referenceNet2026(invalid),null);
  }
  assert.equal(referenceNet2026(20000).net,17987);
  assert.equal(referenceNet2026(140000).net,78569);
});
