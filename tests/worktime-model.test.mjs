import test from 'node:test';
import assert from 'node:assert/strict';
import {mondayOf,lastCompletedMonday,plusDays,validHours,normalizeWeeks,analyzeWeeks} from '../beta-worktime-model.mjs';

test('week boundaries are Monday-based and do not depend on browser time zone',()=>{
 assert.equal(mondayOf('2026-11-20'),'2026-11-16');
 assert.equal(mondayOf('2026-11-22'),'2026-11-16');
 assert.equal(lastCompletedMonday('2026-11-20'),'2026-11-09');
 assert.equal(plusDays('2026-12-31',1),'2027-01-01');
 assert.equal(mondayOf('2026-02-30'),null);
});
test('only validated full weeks and quarter-hour totals persist',()=>{
 assert.ok(validHours(0));assert.ok(validHours(56.25));
 assert.equal(validHours(56.1),false);assert.equal(validHours(169),false);
 assert.equal(validHours(null),false);assert.equal(validHours('40'),false);
 assert.deepEqual(normalizeWeeks({'2026-11-16':56,'2026-11-17':42,'2026-11-09':0,
 '2026-11-02':'40','2026-10-26':168.5}),{'2026-11-16':56,'2026-11-09':0});
});
test('unrecorded weeks cannot become zero or false 48h headroom',()=>{
 const data={'2026-11-09':56,'2026-11-02':40};
 const s=analyzeWeeks(data,{year:2026,today:'2026-11-20',plannedHours:48});
 assert.equal(s.covered,2);assert.equal(s.missing,15);
 assert.equal(s.observedTotal,96);assert.equal(s.observedAverage,48);
 assert.equal(s.rollingAverage,null);assert.equal(s.rollingDifference,null);
 assert.equal(s.planAverage,null);
});
test('17 fully completed weeks show exact 17-week arithmetic and next-week what-if, never legal 4mo verdict',()=>{
 const end='2026-11-09',weeks={};
 for(let i=0;i<17;i++)weeks[plusDays(end,-i*7)]=40;
 const s=analyzeWeeks(weeks,{year:2026,today:'2026-11-20',plannedHours:56});
 assert.equal(s.covered,17);assert.equal(s.missing,0);
 assert.equal(s.rollingAverage,40);assert.equal(s.rollingDifference,136);
 assert.equal(s.nextWeek,'2026-11-16');
 assert.equal(s.planAverage,40.94);assert.equal(s.planDifference,120);
});
test('an unfinished current week never dilutes the completed-week comparison',()=>{
 const end='2026-11-09',weeks={};
 for(let i=0;i<17;i++)weeks[plusDays(end,-i*7)]=48;
 weeks['2026-11-16']=8;
 const s=analyzeWeeks(weeks,{year:2026,today:'2026-11-20',plannedHours:56});
 assert.equal(s.rollingAverage,48);assert.equal(s.rollingDifference,0);
 assert.equal(s.planAverage,48.47);
 assert.equal(s.planDifference,-8);
});
test('year view counts only complete calendar weeks, not cross-year weeks',()=>{
 const rows={'2025-12-29':56,'2026-01-05':40,'2026-01-12':44};
 const s=analyzeWeeks(rows,{year:2026,today:'2026-01-26'});
 assert.equal(s.yearCovered,2);assert.equal(s.yearTotal,84);
 assert.equal(s.yearExpected,3); // Jan 5, Jan 12, Jan 19
 assert.equal(s.yearAverage,42);
});
