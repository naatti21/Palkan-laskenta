import test from "node:test";
import assert from "node:assert/strict";
import {parseBalanceMinutes,formatBalanceMinutes,normalizeBankAnchor,validateBankAnchors,
  mergeBankAnchors,newestBankAnchor,updateBankAnchor,shouldOfferBankPrompt} from "../bank-ledger.js";
import {makeBackup,parseBackup,parseBackupBankSnapshots} from "../model.js";

const now="2026-10-12T12:00:00.000Z";
const bank=(id,date,minutes=2955)=>normalizeBankAnchor({
  id,asOfDate:date,balanceMinutes:minutes,source:"time-system",note:"",
  recordedAt:now,corrections:[]
});
const record=(start,end,kind="payslip")=>({kind,values:{payPeriodStart:start,payPeriodEnd:end,payDate:"2026-10-09"}});

test("49h15 in time-system is exact integer minutes and independent of pay day",()=>{
 assert.equal(parseBalanceMinutes("49:15"),2955);
 assert.equal(parseBalanceMinutes("49,25"),2955);
 assert.equal(parseBalanceMinutes("49.25"),2955);
 assert.equal(formatBalanceMinutes(2955),"49 h 15 min");
 assert.equal(formatBalanceMinutes(-15),"−0 h 15 min");
 assert.equal(parseBalanceMinutes("0:00"),0);
 assert.equal(parseBalanceMinutes("-0:30"),-30);
 assert.equal(parseBalanceMinutes("-12:45"),-765);
 assert.equal(parseBalanceMinutes("-0,5"),-30);
 assert.equal(formatBalanceMinutes(parseBalanceMinutes("-0:30")),"−0 h 30 min");
 assert.equal(formatBalanceMinutes(null),"Ei vahvistettua saldoa");
});
test("invalid dates, malformed clock and NaN cannot be saved",()=>{
 for(const s of ["49:60","NaN","1,2,3","Infinity","49:","",{},null])
  assert.throws(()=>parseBalanceMinutes(s));
 assert.throws(()=>normalizeBankAnchor({...bank("bank-test","2026-10-12"),asOfDate:"2026-02-30"}));
 assert.throws(()=>normalizeBankAnchor({...bank("bank-test","2026-10-12"),balanceMinutes:1.5}));
});
test("snapshot dated Oct 12 is not assigned to Oct 9 payslip",()=>{
 const x=bank("bank-20261012","2026-10-12");
 assert.equal(x.asOfDate,"2026-10-12");
 assert.equal(newestBankAnchor([x]).asOfDate,"2026-10-12");
});
test("later snapshot is selected by observation date, not entry order",()=>{
 const a=bank("bank-new","2026-10-12",2955);
 const b=bank("bank-old","2026-09-15",500);
 assert.equal(newestBankAnchor([a,b]).balanceMinutes,2955);
 assert.equal(newestBankAnchor([b,a]).balanceMinutes,2955);
});
test("update preserves original in revision history without changing id",()=>{
 const x=bank("bank-id","2026-10-12",2955);
 const updated=updateBankAnchor([x],"bank-id",{
  asOfDate:"2026-10-13",balanceMinutes:3000,source:"self",note:"checked"
 },"2026-10-14T09:30:00Z");
 assert.equal(updated.length,1);
 assert.equal(updated[0].balanceMinutes,3000);
 assert.equal(updated[0].corrections[0].balanceMinutes,2955);
 assert.equal(updated[0].corrections[0].asOfDate,"2026-10-12");
 assert.equal(x.balanceMinutes,2955);
});
test("bank backup merges idempotently and rejects colliding IDs with different amounts",()=>{
 const x=bank("bank-one","2026-10-12");
 assert.equal(mergeBankAnchors([x],[x]).length,1);
 assert.equal(mergeBankAnchors([x],[bank("bank-two","2026-10-13")]).length,2);
 assert.throws(()=>mergeBankAnchors([x],[bank("bank-one","2026-10-12",3000)]),/Ristiriitainen/);
 assert.throws(()=>validateBankAnchors([x,x]),/Päällekkäinen/);
});
test("same period bonus, duplicates, older entries and backup import never trigger an extra prompt",()=>{
 const previous=[record("2026-09-01","2026-09-14")];
 const latest=record("2026-09-15","2026-09-28");
 assert.equal(shouldOfferBankPrompt(previous,latest),true);
 assert.equal(shouldOfferBankPrompt(previous,latest,{mergedDuplicate:true}),false);
 assert.equal(shouldOfferBankPrompt(previous,latest,{alreadyAsked:true}),false);
 assert.equal(shouldOfferBankPrompt(previous,latest,{muted:true}),false);
 assert.equal(shouldOfferBankPrompt(previous,record("2026-08-01","2026-08-14")),false);
 assert.equal(shouldOfferBankPrompt([latest],record("2026-09-15","2026-09-28")),false);
 assert.equal(shouldOfferBankPrompt(previous,record("2026-09-29",null)),false);
});
test("new year with a genuinely latest work period can offer optional prompt",()=>{
 assert.equal(shouldOfferBankPrompt([record("2025-12-08","2025-12-21")],
  record("2025-12-22","2026-01-04")),true);
});
test("bank snapshots optional in existing version-2 backups and old array format",()=>{
 const empty=makeBackup([]);
 assert.deepEqual(parseBackup(empty),[]);
 assert.deepEqual(parseBackupBankSnapshots(empty),[]);
 assert.deepEqual(parseBackupBankSnapshots([]),[]);
 const copy={...empty};delete copy.bankSnapshots;
 assert.deepEqual(parseBackupBankSnapshots(copy),[]);
});
test("new bank balance and corrections survive backup roundtrip unchanged",()=>{
 const a=bank("bank-test","2026-10-12");
 const corrected=updateBankAnchor([a],a.id,{
  asOfDate:"2026-10-12",balanceMinutes:2940,source:"time-system",note:"confirmed"
 },now);
 const copy=JSON.parse(JSON.stringify(makeBackup([],{bankSnapshots:corrected})));
 assert.deepEqual(parseBackupBankSnapshots(copy),corrected);
});
test("invalid bank payload fails closed and does not silently restore zero balance",()=>{
 const copy=makeBackup([]);
 copy.bankSnapshots=[{...bank("bank-bad","2026-10-12"),balanceMinutes:"49:15"}];
 assert.throws(()=>parseBackupBankSnapshots(copy),/Saldon tunnit/);
 const noBank=makeBackup([]);
 assert.equal(noBank.bankSnapshots.length,0);
});
