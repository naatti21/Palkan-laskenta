import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../experiments/year-planner/index.html',import.meta.url),'utf8');
const script=html.match(/<script id="planner-core">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Planner core is available');
const context={};vm.runInNewContext(script,context);
const {computePlan,minimumWeekendsForNet}=context.PalkkaPlannerCore;
const config={weekends:0,sat:8,sun:8,baseGross:60000,holiday:0,bonus:0,other:0,
  raise:0,raiseMonth:1,weekendGross:1000,weekendMethod:'manual',
  limitA:62000,limitB:72000,rateA:30,rateB:33,extraA:48,extraB:48,otherDeductions:10};
const plan=()=>computePlan(config);

test('inverse goal uses first sufficient weekend even after A withholding threshold',()=>{
 const s=plan().series;
 assert.equal(minimumWeekendsForNet(s,s[4].netA,'A').n,4);
 assert.equal(minimumWeekendsForNet(s,s[4].netA,'A').free,48);
 assert.equal(minimumWeekendsForNet(s,s[7].netB,'B').n,7);
 assert.equal(minimumWeekendsForNet(s,s[1].netA-0.01,'A').n,1);
});
test('baseline net already covers a low goal without forcing any weekend',()=>{
 const s=plan().series;
 assert.equal(minimumWeekendsForNet(s,0,'A').n,0);
 assert.equal(minimumWeekendsForNet(s,s[0].netB,'B').n,0);
});
test('strict card gross cap excludes higher weekends even if their net reaches the target',()=>{
 const s=plan().series;
 const netTarget=s[3].netA;
 assert.equal(minimumWeekendsForNet(s,netTarget,'A').n,3);
 assert.equal(minimumWeekendsForNet(s,netTarget,'A',config.limitA),null);
 assert.equal(minimumWeekendsForNet(s,s[2].netA,'A',config.limitA).n,2);
 assert.equal(minimumWeekendsForNet(s,s[3].netB,'B',config.limitB).n,3);
});
test('non-achievable goal never fabricates additional net cash',()=>{
 const s=plan().series;
 assert.equal(minimumWeekendsForNet(s,10000000,'A'),null);
 const zeroConfig={...config,baseGross:0,weekendGross:0};
 const same=computePlan(zeroConfig).series;
 assert.equal(minimumWeekendsForNet(same,1000,'A'),null);
});
test('rejects malformed goal, card, cap and incomplete or nonfinite series',()=>{
 const s=plan().series;
 assert.throws(()=>minimumWeekendsForNet(s,-1,'A'),/nettotavoite/);
 assert.throws(()=>minimumWeekendsForNet(s,NaN,'A'),/nettotavoite/);
 assert.throws(()=>minimumWeekendsForNet(s,100,'C'),/vaihtoehto/);
 assert.throws(()=>minimumWeekendsForNet(s,100,'A',-1),/Tuloraja/);
 assert.throws(()=>minimumWeekendsForNet(s.slice(1),100,'A'),/täydellinen/);
 assert.throws(()=>minimumWeekendsForNet([{n:0,gross:10,netA:0,netB:0}],100,'A'),/täydellinen/);
});
test('ui is a compact optional section and never claims a final-tax saving',()=>{
 assert.ok(html.includes('id="inverseGoalPanel"'));
 assert.ok(html.includes('id="inverseNetGoal"'));
 assert.ok(html.includes('id="inverseKeepUnderLimit"'));
 assert.ok(html.includes('id="inverseGoalResults"'));
 assert.match(html,/lopullisen veron optimointi/);
});
