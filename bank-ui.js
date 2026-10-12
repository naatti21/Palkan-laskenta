import {
 BANK_KEY,BANK_PROMPT_KEY,parseBalanceMinutes,formatBalanceMinutes,
 mergeBankAnchors,normalizeBankAnchor,newestBankAnchor,updateBankAnchor,shouldOfferBankPrompt
} from "./bank-ledger.js";
import {getSetting,setSetting} from "./storage.js";
const el=id=>document.getElementById(id);
const readable=s=>s?new Date(s+"T12:00:00").toLocaleDateString("fi-FI"):"–";
let navigate=()=>{};
let editingId=null;
let lastAskedEnd=null;
function clockNowDate() {
 const local=new Date();
 const year=local.getFullYear();
 return [year,String(local.getMonth()+1).padStart(2,"0"),String(local.getDate()).padStart(2,"0")].join("-");
}
export async function loadBankAnchors(){
 const saved=await getSetting(BANK_KEY);
 return mergeBankAnchors([],saved??[]);
}
export async function renderBankUi(){
 const pref=await getSetting(BANK_PROMPT_KEY)||{};
 el("bankUnmute").classList.toggle("hidden",!pref.muted);
 const anchors=await loadBankAnchors();
 const latest=newestBankAnchor(anchors);
 const latestHost=el("bankLatest");
 latestHost.textContent=latest
   ? formatBalanceMinutes(latest.balanceMinutes)+" · vahvistettu "+readable(latest.asOfDate)
   : "Ei vielä vahvistettua työaikapankin saldoa.";
 const host=el("bankHistory");
 host.replaceChildren();
 if(!anchors.length){host.textContent="Saldoa ei ole vielä kirjattu. Voit lisätä sen koska tahansa.";return;}
 for(const item of [...anchors].sort((a,b)=>b.asOfDate.localeCompare(a.asOfDate)||b.recordedAt.localeCompare(a.recordedAt))){
   const row=document.createElement("div");row.className="bank-history-row";
   const copy=document.createElement("div");
   const strong=document.createElement("strong");strong.textContent=formatBalanceMinutes(item.balanceMinutes);
   const sub=document.createElement("span");
   const source={"time-system":"Työaikajärjestelmä","self":"Oma kirjaus","other":"Muu lähde"}[item.source];
   sub.textContent=readable(item.asOfDate)+" · "+source+(item.corrections.length?" · korjattu":"")+(item.note?" · "+item.note:"");
   copy.append(strong,sub);
   const btn=document.createElement("button");btn.className="secondary";
   btn.type="button";btn.textContent="Korjaa";btn.dataset.bankEdit=item.id;
   row.append(copy,btn);host.append(row);
 }
}
function editVisible(visible){
 el("bankFormPanel").classList.toggle("hidden",!visible);
 if(visible)el("bankBalanceInput").focus();
}
function blankForm(){
 editingId=null;
 el("bankBalanceInput").value="";
 el("bankDateInput").value=clockNowDate();
 el("bankSourceInput").value="time-system";
 el("bankNoteInput").value="";
 el("bankFormHeading").textContent="Kirjaa vahvistettu saldo";
 el("bankSaveButton").textContent="Tallenna saldo";
 el("bankEntryStatus").textContent="";
}
async function openForm(id=null){
 const anchors=await loadBankAnchors();
 blankForm();
 if(id){
   const a=anchors.find(x=>x.id===id);
   if(!a)throw new Error("Saldohavaintoa ei löydy.");
   editingId=a.id;
   const sign=a.balanceMinutes<0?"-":"";
   const mins=Math.abs(a.balanceMinutes);
   el("bankBalanceInput").value=sign+Math.floor(mins/60)+":"+String(mins%60).padStart(2,"0");
   el("bankDateInput").value=a.asOfDate;
   el("bankSourceInput").value=a.source;
   el("bankNoteInput").value=a.note;
   el("bankFormHeading").textContent="Korjaa aiempaa saldoa";
   el("bankSaveButton").textContent="Tallenna korjaus";
 }
 navigate("data");
 editVisible(true);
}
async function finishPrompt(mode){
 if(lastAskedEnd) {
   const p=await getSetting(BANK_PROMPT_KEY)||{};
   await setSetting(BANK_PROMPT_KEY,{muted:mode==="mute"||Boolean(p.muted),lastAskedPeriodEnd:lastAskedEnd});
 }
 el("bankPrompt").classList.add("hidden");
 lastAskedEnd=null;
 if(mode==="save")await openForm();
}
export async function offerBankPrompt(previousRecords,record,{mergedDuplicate=false}={}){
 const pref=await getSetting(BANK_PROMPT_KEY)||{};
 const end=record?.values?.payPeriodEnd;
 if(!shouldOfferBankPrompt(previousRecords,record,{
   mergedDuplicate,muted:Boolean(pref.muted),alreadyAsked:pref.lastAskedPeriodEnd===end
 }))return false;
 // Remember once per pay period immediately, including if user navigates away.
 await setSetting(BANK_PROMPT_KEY,{...pref,lastAskedPeriodEnd:end});
 lastAskedEnd=end;
 el("bankPromptPeriod").textContent=readable(end);
 el("bankPrompt").classList.remove("hidden");
 return true;
}
export async function initBankUi(setView){
 navigate=setView;
 el("bankOpenForm").addEventListener("click",()=>openForm().catch(showError));
 el("bankUnmute").addEventListener("click",async()=>{
   await setSetting(BANK_PROMPT_KEY,{muted:false,lastAskedPeriodEnd:null});
   el("bankSaveStatus").textContent="Saldokysely on taas käytössä uusille palkkakausille.";
   await renderBankUi();
 });
 el("bankPromptSave").addEventListener("click",()=>finishPrompt("save").catch(showError));
 el("bankPromptLater").addEventListener("click",()=>finishPrompt("later").catch(showError));
 el("bankPromptMute").addEventListener("click",()=>finishPrompt("mute").catch(showError));
 el("bankFormCancel").addEventListener("click",()=>{editVisible(false);editingId=null;});
 el("bankHistory").addEventListener("click",event=>{
   const btn=event.target.closest("[data-bank-edit]");
   if(btn)openForm(btn.dataset.bankEdit).catch(showError);
 });
 el("bankForm").addEventListener("submit",async event=>{
  event.preventDefault();
  try {
   const minutes=parseBalanceMinutes(el("bankBalanceInput").value);
   const date=el("bankDateInput").value;
   const source=el("bankSourceInput").value;
   const note=el("bankNoteInput").value.trim();
   const timestamp=new Date().toISOString();
   const anchors=await loadBankAnchors();
   let next;
   if(editingId) {
     next=updateBankAnchor(anchors,editingId,
       {asOfDate:date,balanceMinutes:minutes,source,note},timestamp);
   } else {
     const id="bank-"+crypto.randomUUID();
     const entry=normalizeBankAnchor({id,asOfDate:date,balanceMinutes:minutes,source,note,recordedAt:timestamp,corrections:[]});
     next=mergeBankAnchors(anchors,[entry]);
   }
   await setSetting(BANK_KEY,next);
   const isCorrection=Boolean(editingId);
   editingId=null;
   editVisible(false);
   await renderBankUi();
   el("bankSaveStatus").textContent=isCorrection?"Saldo korjattu ja aiempi havainto säilytetty.":"Saldo tallennettu päivämäärään sidottuna.";
  }catch(error) {el("bankEntryStatus").textContent=error.message;}
 });
 await renderBankUi();
}
function showError(err){el("bankSaveStatus").textContent=err.message;}
