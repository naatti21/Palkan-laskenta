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
  const proposalText=text('span','Ei vielä historiaehdotusta');
  const useProposal=text('button','Käytä ehdotusta','secondary');
  useProposal.type='button';useProposal.disabled=true;
  const proposalNote=text('small','Viikkolepokorvaus ei todista työviikonloppujen määrää.');
  proposal.append(proposalText,useProposal,proposalNote);
  const top=text('div','','weekend-top');top.append(title,add);
  panel.append(top,values,proposal,edit,status);
  note.after(panel);

  let activeYear=null,current={done:null,goal:null},generation=0,proposed=null,lastRecords=[];
  const estimate=(records,year)=>{
    if(!Array.isArray(records))return null;
    const projection=projectPayroll(records);
    if(projection.unresolved.some(r=>!r.values?.payDate||r.values.payDate.startsWith(year+'-')))return null;
    const rows=projection.active.filter(r=>r.kind!=='forecast'&&r.values?.payDate?.startsWith(year+'-'));
    if(!rows.length||new Set(rows.map(r=>r.incomeSourceId||'unknown')).size!==1)return null;
    const hours=rows.map(r=>r.values?.weeklyRestHours);
    if(hours.some(h=>!Number.isFinite(h)||h<0))return null;
    const total=hours.reduce((a,b)=>a+b,0);
    if(total<=0||total/8>52)return null;
    return {hours:total,count:Math.round(total/8)};
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
    status.textContent=progress+' · Oma kirjaus tallentuu laitteelle.';
    useProposal.disabled=!proposed;
    proposalText.textContent=proposed
      ? 'Historiaehdotus '+proposed.count+' kpl ('+proposed.hours.toLocaleString('fi-FI')+' viikkolepotuntia)'
      : 'Ei luotettavaa historiaehdotusta';
    proposalNote.textContent=proposed
      ? 'Oletus 8 h / viikonloppu. Korvaus voi liittyä myös muihin työjärjestelyihin. Tarkista ennen hyväksyntää.'
      : 'Voit kirjata viikonloput itse. Palkkarivit eivät sisällä työpäivien kalenteria.';
  };
  const load=async year=>{
    if(!Number.isInteger(year)||year<2020||year>2100)return;
    const requested=++generation;
    activeYear=year;
    proposed=estimate(lastRecords,year);
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
  useProposal.addEventListener('click',()=>{if(proposed)void save({done:proposed.count});});
  yearField.addEventListener('change',()=>void load(Number(yearField.value)));
  document.addEventListener('compact-payments',event=>{
    const year=Number(event.detail?.year);
    if(Array.isArray(event.detail?.records))lastRecords=event.detail.records;
    if(Number.isInteger(year)&&year!==activeYear)void load(year);
    if(year===activeYear){
      proposed=estimate(event.detail?.records,year);
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
