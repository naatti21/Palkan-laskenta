// Beta-only manual weekend log. Payslips contain overtime PAY LINE evidence,
// not calendar work dates: never infer actual weekends from overtime hours.
import {getSetting,setSetting} from './storage.js';
import {projectPayroll} from './model.js';

const key=year=>'beta:workweekends:v1:'+year;
const validCount=n=>Number.isInteger(n)&&n>=0&&n<=52;
const saved=raw=>({
  done:validCount(raw?.done)?raw.done:null,
  goal:validCount(raw?.goal)?raw.goal:null
});
const el=id=>document.getElementById(id);
const text=(tag,content,cls)=>{
  const n=document.createElement(tag);n.textContent=content;
  if(cls)n.className=cls;
  return n;
};

export function installWeekendTracker(){
  if(el('betaWeekendTracker'))return;
  const yearField=el('analysisYear'),note=el('analysisNote');
  const frame=el('plannerFrame');
  if(!yearField||!note||!frame)return;
  const panel=text('div','','beta-weekend-tracker');
  panel.id='betaWeekendTracker';
  const title=text('h3','Työviikonloput');
  const values=text('div','','metrics');
  const doneCard=text('div','','metric');
  const goalCard=text('div','','metric');
  const doneValue=text('strong','–');
  const goalValue=text('strong','–');
  doneValue.id='betaWeekendDone';
  goalValue.id='betaWeekendGoal';
  doneCard.append(text('span','Tehty'),doneValue);
  goalCard.append(text('span','Tavoite'),goalValue);
  values.append(doneCard,goalCard);
  const add=text('button','+1','secondary');
  add.id='betaWeekendAdd';add.type='button';
  const edit=text('details','','');
  const editTitle=text('summary','Muokkaa lukumääriä');
  const fields=text('div','','grid two');
  const doneLabel=text('label','Tehtyjä viikonloppuja','field');
  const goalLabel=text('label','Suunnitelma (viikonloppua)','field');
  const input=(id,label)=>{
    const i=document.createElement('input');
    i.id=id;i.type='number';i.inputMode='numeric';
    i.min='0';i.max='52';i.step='1';i.placeholder='ei kirjattu';
    i.setAttribute('aria-label',label);
    return i;
  };
  const doneInput=input('betaWeekendDoneInput','Tehtyjä työviikonloppuja');
  const goalInput=input('betaWeekendGoalInput','Työviikonloppujen tavoite');
  doneLabel.append(doneInput);goalLabel.append(goalInput);
  fields.append(doneLabel,goalLabel);
  edit.append(editTitle,fields);
  const status=text('p','','muted');
  status.id='betaWeekendTrackerStatus';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const proposal=text('div','','weekend-proposal');
  proposal.hidden=true;
  const proposalText=text('span','');
  const useProposal=text('button','Hyväksy','secondary');
  useProposal.type='button';useProposal.id='betaWeekendUseProposal';useProposal.disabled=true;
  const proposalNote=text('small','Palkkarivien määrä ei yksin todista työviikonloppujen määrää.');
  const proposalRow=text('div','','weekend-proposal-row');
  proposalRow.append(proposalText,useProposal);
  proposal.append(proposalRow,proposalNote);
  const top=text('div','','weekend-top');top.append(title,add);
  panel.append(top,values,proposal,edit,status);
  note.after(panel);
  const css=document.createElement('style');
  css.textContent=`
    #betaWeekendTracker{margin:8px 0 5px;padding:9px 10px;border:1px solid #344d59;border-radius:9px;background:#101d26}
    #betaWeekendTracker{box-sizing:border-box;max-width:100%;min-width:0}
    #betaWeekendTracker .weekend-top{display:flex;justify-content:space-between;align-items:center;gap:8px;min-width:0}
    #betaWeekendTracker .weekend-top button{box-sizing:border-box;flex:0 0 36px!important;width:36px!important;min-width:36px!important;max-width:36px!important;padding:4px!important}
    #betaWeekendTracker h3{font-size:.91rem;margin:0}
    #betaWeekendTracker button{min-height:34px;min-width:48px;padding:5px 10px;font-size:.78rem}
    #betaWeekendTracker .metrics{display:flex;gap:18px;margin:6px 0}
    #betaWeekendTracker .metric{display:flex;align-items:baseline;gap:6px;min-width:0;padding:0;border:0;background:none;box-shadow:none}
    #betaWeekendTracker .metric span{font-size:.75rem}
    #betaWeekendTracker .metric strong{font-size:1.11rem}
    #betaWeekendTracker .weekend-proposal{border-top:1px solid #344d59;padding-top:7px;margin-top:6px}
    #betaWeekendTracker .weekend-proposal[hidden]{display:none!important}
    #betaWeekendTracker .weekend-proposal-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}
    #betaWeekendTracker .weekend-proposal-row>span{font-size:.77rem;line-height:1.35}
    #betaWeekendTracker .weekend-proposal-row button{white-space:normal;max-width:120px}
    #betaWeekendTracker .weekend-proposal small{display:block;color:#b6c7d0;font-size:.67rem;line-height:1.35;margin-top:4px}
    #betaWeekendTracker>details{margin:3px 0 0}
    #betaWeekendTracker>details>summary{font-size:.74rem;padding:3px 0;cursor:pointer}
    #betaWeekendTracker>details .grid{margin-top:6px}
    #betaWeekendTracker>details label{font-size:.74rem}
    #betaWeekendTracker>details input{width:100%;box-sizing:border-box}
    #betaWeekendTracker #betaWeekendTrackerStatus{font-size:.67rem;line-height:1.3;margin:3px 0 0;color:#b3c7d1}
    @media(max-width:345px){#betaWeekendTracker .weekend-proposal-row{grid-template-columns:minmax(0,1fr) auto}}
  `;
  document.head.append(css);

  let activeYear=null,current={done:null,goal:null},generation=0,proposed=null,lastRecords=[];
  // Count observed pay-line appearances, never infer weekends from hours or pay amounts.
  const countMentions=(records,year)=>{
    if(!Array.isArray(records))return null;
    const projection=projectPayroll(records);
    if(projection.unresolved.some(r=>!r.values?.payDate||r.values.payDate.startsWith(year+'-')))return null;
    const rows=projection.active.filter(r=>r.kind!=='forecast'&&r.values?.payDate?.startsWith(year+'-'));
    if(!rows.length)return null;
    // Do not mix unrelated employers' payroll histories into one weekend tally.
    if(new Set(rows.map(r=>r.incomeSourceId||'unknown')).size>1)return null;
    let count=0,documents=0;
    for(const record of rows){
      const lines=(record.payLines||[]).filter(l=>
        l?.category==='weekly_rest'||String(l?.code)==='20120'||
        /viikkovapaa|viikkolepo/i.test(String(l?.label||'')));
      count+=lines.length;
      if(lines.length)documents++;
    }
    return count>0?{count,documents}:null;
  };
  let pending=Promise.resolve();
  const show=()=>{
    doneValue.textContent=current.done===null?'–':String(current.done);
    goalValue.textContent=current.goal===null?'–':String(current.goal);
    doneInput.value=current.done===null?'':String(current.done);
    goalInput.value=current.goal===null?'':String(current.goal);
    add.disabled=activeYear===null||current.done===52;
    const progress=current.done===null?'Ei vielä kirjattua toteumaa.'
      :current.goal===null?'Kirjattu '+current.done+' työviikonloppua.'
      :'Kirjattu '+current.done+' / '+current.goal+' · jäljellä tavoitteeseen '+
        Math.max(0,current.goal-current.done)+'.';
    status.textContent=progress+' Palkkalaskelmasta ei voi varmistaa työviikonloppuja.';
    proposal.hidden=!proposed;
    useProposal.disabled=!proposed||!validCount(proposed.count);
    proposalText.textContent=proposed
      ? 'Viikkolepo mainittu '+proposed.count+' palkkarivillä'
      : '';
    useProposal.textContent=proposed?'Hyväksy '+proposed.count:'Hyväksy';
    proposalNote.textContent=proposed
      ? proposed.documents+' palkkalaskelmassa vuonna '+activeYear+
        '. Hyväksy tehtyjen viikonloppujen määräksi vain, jos se vastaa omaa työaikaasi.'
      : '';
  };
  const load=async year=>{
    if(!Number.isInteger(year)||year<2020||year>2100)return;
    const requested=++generation;
    activeYear=year;
    proposed=countMentions(lastRecords,year);
    try{
      const row=saved(await getSetting(key(year)));
      if(requested!==generation)return;
      current=row;
      show();
    }catch{
      if(requested!==generation)return;
      current={done:null,goal:null};show();
      status.textContent='Paikallista työviikonloppukirjausta ei voitu lukea.';
    }
  };
  const save=async patch=>{
    if(activeYear===null)return false;
    const year=activeYear;
    current={...current,...patch};
    const snapshot={...current};
    show();
    pending=pending.catch(()=>{}).then(()=>setSetting(key(year),snapshot));
    try{await pending;return true;}
    catch{status.textContent='Tallennus epäonnistui. Tarkista laitteen tallennustila.';return false;}
  };
  const change=inputEl=>{
    const raw=inputEl.value.trim();
    const value=raw===''?null:Number(raw);
    if(value!==null&&!validCount(value)){
      status.textContent='Anna kokonaisluku väliltä 0–52.';
      return;
    }
    void save(inputEl===doneInput?{done:value}:{goal:value});
  };
  doneInput.addEventListener('change',()=>change(doneInput));
  goalInput.addEventListener('change',()=>change(goalInput));
  add.addEventListener('click',()=>void save({done:(current.done??0)+1}));
  useProposal.addEventListener('click',()=>{
    if(proposed&&validCount(proposed.count))void save({done:proposed.count});
  });
  yearField.addEventListener('change',()=>void load(Number(yearField.value)));
  document.addEventListener('compact-payments',event=>{
    const year=Number(event.detail?.year);
    if(Array.isArray(event.detail?.records))lastRecords=event.detail.records;
    if(Number.isInteger(year)&&year!==activeYear)void load(year);
    if(year===activeYear){
      proposed=countMentions(event.detail?.records,year);
      show();
    }
  });
  window.addEventListener('message',async event=>{
    const msg=event.data;
    if(event.origin!==location.origin||event.source!==frame.contentWindow||
       msg?.type!=='palkka:beta:weekend-goal')return;
    const year=msg.year,goal=msg.goal;
    let ok=false;
    if(Number.isInteger(year)&&year>=2020&&year<=2100&&validCount(goal)){
      if(year===activeYear)ok=await save({goal});
      else try{
        const previous=saved(await getSetting(key(year)));
        await setSetting(key(year),{...previous,goal});
        ok=true;
      }catch{ok=false;}
    }
    frame.contentWindow?.postMessage({
      type:'palkka:beta:weekend-goal-result',year,goal,ok
    },location.origin);
  });
  void load(Number(yearField.value)||new Date().getFullYear());
}
