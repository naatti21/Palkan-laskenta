// Manual bank balance anchors only. Salary lines do not determine bank balance.
export const BANK_KEY = "worktimeBankAnchors:v1";
export const BANK_PROMPT_KEY = "worktimeBankPrompt:v1";
const sources = new Set(["time-system","self","other"]);
export function validIsoDay(s) {
  if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y,m,d]=s.split("-").map(Number);
  const v=new Date(Date.UTC(y,m-1,d));
  return v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d;
}
export function parseBalanceMinutes(raw) {
  if(typeof raw!=="string" && typeof raw!=="number") throw new Error("Kirjoita saldo muodossa 49:15 tai 49,25.");
  const s=String(raw).trim();
  if(!s) throw new Error("Anna työaikapankin saldo.");
  let minutes;
  const clock=/^(-?)(\d{1,5}):(\d{2})$/.exec(s);
  if(clock) {
    if(Number(clock[3])>59) throw new Error("Minuutit ovat 00–59.");
    minutes=(Number(clock[2])*60+Number(clock[3]))*(clock[1] ? -1 : 1);
  } else if(/^-?\d{1,5}(?:[,.]\d{1,4})?$/.test(s)) {
    minutes=Math.round(Number(s.replace(",","."))*60);
  } else {
    throw new Error("Kirjoita saldo muodossa 49:15 tai 49,25.");
  }
  if(!Number.isSafeInteger(minutes)||Math.abs(minutes)>600000) throw new Error("Tuntimäärä ei ole kelvollinen.");
  return minutes;
}
export function formatBalanceMinutes(minutes) {
  if(!Number.isSafeInteger(minutes)) return "Ei vahvistettua saldoa";
  const n=Math.abs(minutes);
  return (minutes<0?"−":"")+Math.floor(n/60)+" h "+String(n%60).padStart(2,"0")+" min";
}
export function normalizeBankAnchor(input) {
  if(!input||typeof input!=="object"||Array.isArray(input)) throw new Error("Virheellinen pankkisaldon havainto.");
  const id=String(input.id??"");
  if(!/^[A-Za-z0-9_-]{4,80}$/.test(id)) throw new Error("Virheellinen saldo-ID.");
  if(!validIsoDay(input.asOfDate)) throw new Error("Saldon päivämäärä ei ole kelvollinen.");
  if(!Number.isSafeInteger(input.balanceMinutes)||Math.abs(input.balanceMinutes)>600000)
    throw new Error("Saldon tunnit eivät ole kelvollisia.");
  if(!sources.has(input.source)) throw new Error("Saldon lähde ei ole kelvollinen.");
  if(typeof input.note!=="string"||input.note.length>160) throw new Error("Saldon muistiinpano on liian pitkä.");
  if(typeof input.recordedAt!=="string"||!Number.isFinite(Date.parse(input.recordedAt)))
    throw new Error("Saldon kirjausaika puuttuu.");
  const corrections=Array.isArray(input.corrections)?input.corrections:[];
  if(corrections.length>50) throw new Error("Liikaa saldon korjaushistoriaa.");
  const cleanedCorrections=corrections.map(row=>{
    if(!row||!validIsoDay(row.asOfDate)||!Number.isSafeInteger(row.balanceMinutes)||
      Math.abs(row.balanceMinutes)>600000||!sources.has(row.source)||typeof row.note!=="string"||
      row.note.length>160||typeof row.correctedAt!=="string"||!Number.isFinite(Date.parse(row.correctedAt)))
      throw new Error("Virheellinen pankkisaldon korjaushistoria.");
    return {asOfDate:row.asOfDate,balanceMinutes:row.balanceMinutes,source:row.source,
      note:row.note,correctedAt:row.correctedAt};
  });
  return {id,asOfDate:input.asOfDate,balanceMinutes:input.balanceMinutes,source:input.source,
    note:input.note,recordedAt:input.recordedAt,corrections:cleanedCorrections};
}
export function validateBankAnchors(input) {
  if(!Array.isArray(input)||input.length>1000) throw new Error("Pankkisaldojen varmuuskopion rakenne on virheellinen.");
  const anchors=input.map(normalizeBankAnchor);
  if(new Set(anchors.map(x=>x.id)).size!==anchors.length) throw new Error("Päällekkäinen saldo-ID varmuuskopiossa.");
  return anchors;
}
export function mergeBankAnchors(existing,incoming) {
  const all=validateBankAnchors(existing);
  const added=validateBankAnchors(incoming);
  const ids=new Map(all.map(x=>[x.id,x]));
  for(const x of added) {
    if(!ids.has(x.id)) {all.push(x);ids.set(x.id,x);}
    else if(JSON.stringify(ids.get(x.id))!==JSON.stringify(x))
      throw new Error("Ristiriitainen saldohavainto varmuuskopiossa. Pankkisaldoja ei muutettu.");
  }
  return all.sort((a,b)=>a.asOfDate.localeCompare(b.asOfDate)||a.recordedAt.localeCompare(b.recordedAt));
}
export function newestBankAnchor(anchors) {
  return [...validateBankAnchors(anchors)].sort((a,b)=>
    b.asOfDate.localeCompare(a.asOfDate)||b.recordedAt.localeCompare(a.recordedAt))[0]||null;
}
export function updateBankAnchor(anchors,id,values,at) {
  const current=validateBankAnchors(anchors);
  const index=current.findIndex(x=>x.id===id);
  if(index===-1) throw new Error("Korjattavaa saldoa ei löydy.");
  const previous=current[index];
  const next=normalizeBankAnchor({...values,id,recordedAt:previous.recordedAt,
    corrections:[...previous.corrections,{
      asOfDate:previous.asOfDate,balanceMinutes:previous.balanceMinutes,
      source:previous.source,note:previous.note,correctedAt:at
    }]});
  current[index]=next;
  return current;
}
export function shouldOfferBankPrompt(previousRecords,addedRecord,{mergedDuplicate=false,muted=false,alreadyAsked=false}={}) {
  if(mergedDuplicate||muted||alreadyAsked||!addedRecord||addedRecord.kind==="forecast") return false;
  const end=addedRecord.values?.payPeriodEnd;
  if(!validIsoDay(end)) return false;
  const existingEnds=(Array.isArray(previousRecords)?previousRecords:[]).map(r=>r.values?.payPeriodEnd).filter(validIsoDay);
  return existingEnds.length===0||end>existingEnds.sort().at(-1);
}
