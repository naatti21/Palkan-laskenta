// Tax-card withholding simulation for additional cash wages.
// NO prediction of final tax, contractual weekend pay, pension rates, or performed hours.
// No source records are changed; inputs are annual tax-card assumptions as of a pay date.
const valid=n=>typeof n==="number"&&Number.isFinite(n);
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
function rate(n){return valid(n)&&n>=0&&n<=100}
export function validateScenario(s) {
 if(!s||!rate(s.baseRate)||!rate(s.extraRate)||!rate(s.otherRate)||
    !valid(s.remainingLimit)||s.remainingLimit<0||s.remainingLimit>1000000||
    s.baseRate+s.otherRate>100||s.extraRate+s.otherRate>100) return false;
 return true;
}
export function incrementalNet(gross,s) {
 if(!validateScenario(s)||!valid(gross)||gross<0||gross>1e7)return null;
 const under=Math.min(gross,s.remainingLimit);
 const over=Math.max(0,gross-under);
 const withholding=round2(under*s.baseRate/100+over*s.extraRate/100);
 const other=round2(gross*s.otherRate/100);
 const net=round2(gross-withholding-other);
 const hypotheticalNoStep=round2(gross-round2(gross*s.baseRate/100)-other);
 return {gross,under:round2(under),over:round2(over),withholding,other,net,
  noStepNet:hypotheticalNoStep};
}
export function taxCurve(s,maxGross=3000){
 if(!validateScenario(s)||!valid(maxGross)||maxGross<=0)return null;
 const xs=new Set([0,maxGross,...Array.from({length:25},(_,i)=>maxGross*i/24)]);
 if(s.remainingLimit>0&&s.remainingLimit<maxGross)xs.add(s.remainingLimit);
 const rows=[...xs].sort((a,b)=>a-b).map(gross=>incrementalNet(gross,s));
 return {rows,breakAt:s.remainingLimit>0&&s.remainingLimit<=maxGross?s.remainingLimit:null,
  maxGross};
}
export function nextHundred(s) {
 const x=incrementalNet(100,s);
 if(!x)return null;
 return {net:x.net,withholding:x.withholding,other:x.other,
   belowLimit:round2(100*(100-s.baseRate-s.otherRate)/100),
   aboveLimit:round2(100*(100-s.extraRate-s.otherRate)/100)};
}
export function weekendSimulation(s,{weekendGross,weekendHours,weekendCount,freeHourValue}) {
 if(!validateScenario(s)||!valid(weekendGross)||weekendGross<=0||weekendGross>10000||
   !valid(weekendHours)||weekendHours<=0||weekendHours>80||
   !Number.isInteger(weekendCount)||weekendCount<1||weekendCount>12||
   !valid(freeHourValue)||freeHourValue<0||freeHourValue>200)return null;
 const periods=[];
 let cum=0,firstBelow=null,firstLimit=null,overTotal=0;
 for(let n=1;n<=weekendCount;n++) {
  const before=incrementalNet(cum,s);
  const after=incrementalNet(cum+weekendGross,s);
  const net=round2(after.net-before.net);
  const leisure=round2(weekendHours*freeHourValue);
  const under=Math.max(0,Math.min(weekendGross,s.remainingLimit-cum));
  const over=round2(weekendGross-under);
  overTotal=round2(overTotal+over);
  if(over>0&&firstLimit===null)firstLimit=n;
  if(net<leisure&&firstBelow===null)firstBelow=n;
  periods.push({index:n,gross:weekendGross,
    net,afterNet:after.net,under:round2(under),over,leisure,
    euroPerHour:round2(net/weekendHours),delta:round2(net-leisure)});
  cum+=weekendGross;
 }
 return {periods,firstBelowLeisure:firstBelow,firstHigherWithholding:firstLimit,
    cumulativeGross:round2(cum),cumulativeNet:periods.at(-1).afterNet,
    cumulativeHours:round2(weekendCount*weekendHours),
    cumulativeBeyondLimit:overTotal};
}
// Reviewable tax-card defaults: never conflate taxable YTD with tax card accumulated income.
// Default ONLY when explicit card limit, accumulated income and both percent fields are present.
export function deriveTaxDefaults(records,year) {
 const xs=(Array.isArray(records)?records:[]).filter(r=>
  r?.kind!=="forecast"&&typeof r?.values?.payDate==="string"&&
  /^\d{4}-\d{2}-\d{2}$/.test(r.values.payDate)&&
  r.values.payDate.startsWith(String(year)+"-"))
  .sort((a,b)=>a.values.payDate.localeCompare(b.values.payDate));
 const last=xs.at(-1);
 const v=last?.values||{};
 const r={sourceDate:v.payDate||null,baseRate:v.taxRate,extraRate:v.additionalRate,
   limit:v.taxLimit,accumulated:v.taxCardAccumulatedIncome};
 if(!rate(r.baseRate))r.baseRate=null;
 if(!rate(r.extraRate))r.extraRate=null;
 if(!valid(r.limit)||r.limit<=0)r.limit=null;
 if(!valid(r.accumulated)||r.accumulated<0)r.accumulated=null;
 return {...r,remainingLimit:r.limit==null||r.accumulated==null?null:
   round2(Math.max(0,r.limit-r.accumulated))};
}
