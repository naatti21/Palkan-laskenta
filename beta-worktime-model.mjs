// Beta-only, user-confirmed weekly *total* hours. Payroll overtime is never
// silently converted into worked hours. No legal permission is inferred here.
export const WORKTIME_KEY='beta:worktime:weeks:v1';
export const WORKTIME_MODE_KEY='beta:worktime:mode:v1';
const DAY=86400000;
const validISO=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
  !Number.isNaN(Date.parse(s+'T00:00:00Z'))&&
  new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const date=s=>new Date(s+'T00:00:00Z');
const iso=d=>d.toISOString().slice(0,10);
export const plusDays=(s,n)=>validISO(s)&&Number.isInteger(n)?iso(new Date(date(s).getTime()+n*DAY)):null;
export function mondayOf(value){
  if(!validISO(value))return null;
  const d=date(value);
  return iso(new Date(d.getTime()-((d.getUTCDay()+6)%7)*DAY));
}
export function validHours(n){
  return typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=168&&Number.isInteger(n*4);
}
export function normalizeWeeks(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
  const out={};
  for(const [week,hours] of Object.entries(raw)){
    if(mondayOf(week)===week&&validHours(hours))out[week]=hours;
  }
  return out;
}
export function lastCompletedMonday(today){
  const mon=mondayOf(today);
  return mon?plusDays(mon,-7):null;
}
function average(n,denom){return denom?Math.round(n/denom*100)/100:null;}
export function analyzeWeeks(raw,{year,today,plannedHours=null}={}){
  if(!Number.isInteger(year)||year<2020||year>2100||!validISO(today))throw new Error('Invalid comparison scope');
  const weeks=normalizeWeeks(raw);
  const cutoff=lastCompletedMonday(today);
  let last=plusDays(String(year)+'-12-31',-((date(String(year)+'-12-31').getUTCDay()+6)%7));
  if(last>cutoff)last=cutoff;
  const isInYear=week=>week&&Number(week.slice(0,4))===year;
  const windowStart=plusDays(last,-16*7);
  const period=[];
  for(let i=0;i<17;i++)period.push(plusDays(windowStart,i*7));
  const known=period.filter(w=>Object.hasOwn(weeks,w));
  const observedTotal=known.reduce((n,w)=>n+weeks[w],0);
  const rollingComplete=known.length===17;
  const recentSixteen=period.slice(1).every(w=>Object.hasOwn(weeks,w));
  const futureWeek=plusDays(last,7);
  const validPlan=validHours(plannedHours);
  const nextTotal=recentSixteen&&validPlan
    ?period.slice(1).reduce((n,w)=>n+weeks[w],plannedHours):null;
  const yearEntries=[];
  const firstMonday=(()=>{let d=year+'-01-01';while(date(d).getUTCDay()!==1)d=plusDays(d,1);return d;})();
  for(let w=firstMonday;w&&w<=last;w=plusDays(w,7)){
    // Count whole weeks falling within the chosen calendar year. For year-edge
    // partial weeks, daily records would be needed for an exact legal test.
    if(!isInYear(w)||Number(plusDays(w,6).slice(0,4))!==year)continue;
    yearEntries.push(w);
  }
  const yearKnown=yearEntries.filter(w=>Object.hasOwn(weeks,w));
  const ytdTotal=yearKnown.reduce((n,w)=>n+weeks[w],0);
  return {
    year,cutoff,latestWeek:last,windowStart,
    covered:known.length,expected:17,missing:17-known.length,
    observedTotal,observedAverage:average(observedTotal,known.length),
    rollingAverage:rollingComplete?average(observedTotal,17):null,
    rollingDifference:rollingComplete?Math.round((48*17-observedTotal)*100)/100:null,
    yearCovered:yearKnown.length,yearExpected:yearEntries.length,
    yearTotal:ytdTotal,yearAverage:average(ytdTotal,yearKnown.length),
    yearComplete:yearEntries.length>0&&yearEntries.length===yearKnown.length,
    nextWeek:futureWeek,planAverage:nextTotal!==null?average(nextTotal,17):null,
    planDifference:nextTotal!==null?Math.round((48*17-nextTotal)*100)/100:null
  };
}
