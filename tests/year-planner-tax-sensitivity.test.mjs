import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../experiments/year-planner/index.html',import.meta.url),'utf8');
const script=html.match(/<script id="planner-core">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'planner-core exists');
const context={};vm.runInNewContext(script,context);
const {computePlan,rateSensitivity}=context.PalkkaPlannerCore;
const c={weekends:10,sat:8,sun:8,baseGross:52000,holiday:2500,bonus:0,other:0,
raise:0,raiseMonth:1,weekendGross:1000,weekendMethod:'manual',
limitA:77000,limitB:100000,rateA:30,rateB:33,extraA:48,extraB:48,otherDeductions:10};
const r=()=>computePlan(c);
const near=(a,b)=>assert.ok(Math.abs(a-b)<0.00001,String(a)+' vs '+String(b));

test('zero uncertainty exactly reproduces signed cumulative annual net difference across 53 points',()=>{
 const plan=r(), points=rateSensitivity(plan.series,c,0);
 assert.equal(points.length,53);
 for(let i=0;i<53;i++){near(points[i].low,plan.series[i].netA-plan.series[i].netB);
   near(points[i].high,points[i].normal);}
});
test('±1p on both base and supplementary percentages yields a conservative selected-weekend envelope',()=>{
 const plan=r(), v=rateSensitivity(plan.series,c,1);
 const n=10,g=plan.series[n].gross;
 near(v[n].low,v[n].normal-g*.02);
 near(v[n].high,v[n].normal+g*.02);
 assert.ok(v[n].low<=v[n].normal && v[n].high>=v[n].normal);
});
test('±2p uncertainty is never tighter than ±1p',()=>{
 const plan=r(), one=rateSensitivity(plan.series,c,1),two=rateSensitivity(plan.series,c,2);
 for(let n=0;n<=52;n++){assert.ok(two[n].low<=one[n].low);assert.ok(two[n].high>=one[n].high);}
});
test('some scenarios preserve A advantage in both extremes',()=>{
 const config={...c,rateA:20,rateB:40};
 const plan=computePlan(config);
 const p=rateSensitivity(plan.series,config,2)[0];
 assert.ok(p.low>0);
});
test('another scenario changes leader within the stated range',()=>{
 const config={...c,rateA:30,rateB:31};
 const plan=computePlan(config);
 const p=rateSensitivity(plan.series,config,1)[0];
 assert.ok(p.low<0 && p.high>0);
});
test('fully identical tax cards yield identical nominal annual net regardless of base income',()=>{
 const config={...c,limitB:c.limitA,rateB:c.rateA,extraB:c.extraA};
 const p=rateSensitivity(computePlan(config).series,config,2);
 assert.ok(p.every(x=>Math.abs(x.normal)<0.00001 && x.low<=0 && x.high>=0));
});
test('rates are clamped rather than producing negative withholding',()=>{
 const config={...c,rateA:0,rateB:90,extraA:0,extraB:90};
 const p=rateSensitivity(computePlan(config).series,config,2);
 assert.ok(p.every(x=>Number.isFinite(x.low)&&Number.isFinite(x.high)&&x.low<=x.normal&&x.normal<=x.high));
});
test('bad percent inputs and missing revenue data fail closed',()=>{
 assert.throws(()=>rateSensitivity(r().series,c,3),/Koevaihtelun/);
 assert.throws(()=>rateSensitivity([{n:0,gross:NaN}],c,1),/tulopisteet/);
 assert.throws(()=>rateSensitivity(r().series,{...c,rateA:95},1),/100 %/);
});
test('UI explains December historical estimates and no automatic card order',()=>{
 assert.ok(html.includes('id="decemberTaxNote"'));
 assert.match(html,/vain tilattu verokortti tulee voimaan/);
 assert.match(html,/Prosenttia ja tulorajaa ei voi valita OmaVerossa toisistaan riippumatta/);
 assert.ok(html.includes('id="rateUncertainty"')&&html.includes('id="sensitivitySummary"'));
 assert.match(html,/eivät OmaVeron antamat prosentit/);
});
