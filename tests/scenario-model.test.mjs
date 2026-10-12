import test from "node:test";
import assert from "node:assert/strict";
import {validateScenario,incrementalNet,taxCurve,nextHundred,weekendSimulation,deriveTaxDefaults} from "../scenario-model.js";

const s={baseRate:30,extraRate:47,otherRate:7,remainingLimit:650};
const slip=(date,fields={})=>({
 kind:"payslip",values:{payDate:date,grossPay:3000,netPay:2000,
 taxRate:fields.basic??30,additionalRate:fields.extra??47,taxLimit:fields.limit??6000,
 taxCardAccumulatedIncome:fields.cardYtd??5500,ytdTaxableIncome:fields.ytd??9000}
});

test("100 euros before and after tax card threshold: includes only documented assumptions",()=>{
 assert.deepEqual(nextHundred(s),{net:63,withholding:30,other:7,belowLimit:63,aboveLimit:46});
 assert.deepEqual(incrementalNet(100,{...s,remainingLimit:0}),
  {gross:100,under:0,over:100,withholding:47,other:7,net:46,noStepNet:63});
});

test("exact boundary: before threshold 650, over portion at extra rate",()=>{
 const r=incrementalNet(800,s);
 assert.deepEqual(r,{gross:800,under:650,over:150,withholding:265.5,other:56,
 net:478.5,noStepNet:504});
 assert.equal(incrementalNet(650,s).net,409.5);
 assert.equal(incrementalNet(651,s).net,409.96);
});

test("tax curve has transparent bend at exact threshold and baseline alternative",()=>{
 const r=taxCurve(s,2000);
 assert.equal(r.breakAt,650);
 assert.ok(r.rows.some(x=>x.gross===650));
 const below=r.rows.find(x=>x.gross===650);
 assert.equal(below.net,below.noStepNet);
 const after=r.rows.at(-1);
 assert.ok(after.noStepNet>after.net);
 assert.equal(taxCurve({...s,remainingLimit:0},2000).breakAt,null);
 assert.equal(taxCurve({...s,remainingLimit:4000},2000).breakAt,null);
});

test("weekend is a bundle not separate Saturday and Sunday; crossing after tax-card threshold",()=>{
 const w=weekendSimulation(s,{weekendGross:500,weekendHours:16,weekendCount:4,freeHourValue:15});
 assert.equal(w.periods[0].net,315);
 assert.equal(w.periods[1].net,255.5);
 assert.equal(w.periods[2].net,230);
 assert.equal(w.periods[0].leisure,240);
 assert.equal(w.periods[1].under,150);
 assert.equal(w.periods[1].over,350);
 assert.equal(w.firstHigherWithholding,2);
 assert.equal(w.firstBelowLeisure,3);
 assert.equal(w.cumulativeGross,2000);
 assert.equal(w.cumulativeNet,1030.5);
 assert.equal(w.cumulativeHours,64);
});

test("weekend remainder is not taxed at full extra rate if limit crossed mid-payment",()=>{
 const w=weekendSimulation({...s,remainingLimit:250},{weekendGross:500,weekendHours:16,weekendCount:2,freeHourValue:0});
 assert.equal(w.periods[0].under,250);
 assert.equal(w.periods[0].over,250);
 assert.equal(w.periods[0].net,272.5);
 assert.equal(w.periods[1].net,230);
});

test("if free time value remains below net gain, report no crossover",()=>{
 const w=weekendSimulation({...s,remainingLimit:0},{weekendGross:500,weekendHours:16,weekendCount:3,freeHourValue:5});
 assert.equal(w.firstBelowLeisure,null);
 assert.equal(w.firstHigherWithholding,1);
});

test("derive only from tax card recorded values, not regular taxable YTD",()=>{
 const a=deriveTaxDefaults([slip("2026-10-09",{cardYtd:5800,limit:6000})],2026);
 assert.equal(a.remainingLimit,200);
 const b=slip("2026-10-23",{ytd:43000});
 b.values.taxCardAccumulatedIncome=null;
 assert.equal(deriveTaxDefaults([b],2026).remainingLimit,null);
 const x=deriveTaxDefaults([slip("2027-01-05")],2026);
 assert.equal(x.sourceDate,null);
 assert.equal(x.remainingLimit,null);
});

test("if card threshold already exceeded, remaining is zero, never negative",()=>{
 assert.equal(deriveTaxDefaults([slip("2026-10-09",{limit:6000,cardYtd:7000})],2026).remainingLimit,0);
});

test("newest explicit card row wins for selected payment year without mutating source",()=>{
 const old=slip("2026-04-01",{basic:21,extra:42,limit:40000,cardYtd:23000});
 const latest=slip("2026-10-01",{basic:29,extra:49,limit:60000,cardYtd:39000});
 const records=[latest,old],snapshot=JSON.stringify(records);
 assert.equal(deriveTaxDefaults(records,2026).baseRate,29);
 assert.equal(deriveTaxDefaults(records,2026).remainingLimit,21000);
 assert.equal(JSON.stringify(records),snapshot);
});

test("invalid rates, conflicting assumptions, missing card inputs fail closed",()=>{
 assert.equal(validateScenario({...s,extraRate:null}),false);
 assert.equal(validateScenario({...s,remainingLimit:null}),false);
 assert.equal(validateScenario({...s,otherRate:80}),false);
 assert.equal(incrementalNet(100,{...s,baseRate:101}),null);
 assert.equal(weekendSimulation(s,{weekendGross:0,weekendHours:16,weekendCount:4,freeHourValue:10}),null);
 assert.equal(weekendSimulation(s,{weekendGross:500,weekendHours:0,weekendCount:4,freeHourValue:10}),null);
 assert.equal(weekendSimulation(s,{weekendGross:500,weekendHours:16,weekendCount:13,freeHourValue:10}),null);
 assert.equal(incrementalNet(-100,s),null);
});

test("cumulative tax calculation does not depend on order of payslip periods",()=>{
 const w=weekendSimulation({...s,remainingLimit:350},{weekendGross:100,weekendHours:8,weekendCount:6,freeHourValue:0});
 assert.equal(w.periods[3].under,50);
 assert.equal(w.periods[3].over,50);
 assert.equal(w.periods.reduce((a,x)=>a+x.net,0),w.cumulativeNet);
});
