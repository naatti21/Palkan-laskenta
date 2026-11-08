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
  const unitLabel=text('label','h / viikonloppu');
  const unit=document.createElement('input');
  unit.type='number';unit.id='betaRestHoursPerWeekend';unit.min='1';unit.max='24';
  unit.step='0.5';unit.inputMode='decimal';unit.value='8';
  unit.setAttribute('aria-label','Viikkolepokorvaustunteja työviikonloppua kohti');
  unitLabel.append(unit);
  const useProposal=text('button','Käytä','secondary');
  useProposal.type='button';useProposal.id='betaWeekendUseProposal';useProposal.disabled=true;
  const proposalNote=text('small','Vain arvio. Korvaus ei vahvista kalenterin työviikonloppuja.');
  const proposalRow=text('div','','weekend-proposal-row');
  proposalRow.append(proposalText,unitLabel,useProposal);
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
    #betaWeekendTracker .weekend-proposal-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:7px;align-items:center}
    #betaWeekendTracker .weekend-proposal-row>span{font-size:.77rem;line-height:1.35}
    #betaWeekendTracker .weekend-proposal-row label{display:flex;align-items:center;gap:4px;font-size:.67rem;white-space:nowrap}
    #betaWeekendTracker .weekend-proposal-row input{width:46px;min-width:0;max-width:46px;min-height:34px;padding:4px;border-radius:6px;font-size:.8rem}
    #betaWeekendTracker .weekend-proposal small{display:block;color:#b6c7d0;font-size:.67rem;line-height:1.35;margin-top:4px}
    #betaWeekendTracker>details{margin:3px 0 0}
    #betaWeekendTracker>details>summary{font-size:.74rem;padding:3px 0;cursor:pointer}
    #betaWeekendTracker>details .grid{margin-top:6px}
    #betaWeekendTracker>details label{font-size:.74rem}
    #betaWeekendTracker>details input{width:100%;box-sizing:border-box}
    #betaWeekendTracker #betaWeekendTrackerStatus{font-size:.67rem;line-height:1.3;margin:3px 0 0;color:#b3c7d1}
    @media(max-width:345px){#betaWeekendTracker .weekend-proposal-row{grid-template-columns:minmax(0,1fr) auto}#betaWeekendTracker .weekend-proposal-row>span{grid-column:1/-1}}
  `;
  document.head.append(css);

  let activeYear=null,current={done:null,goal:null},generation=0,proposed=null,lastRecords=[];
  const estimate=(records,year)=>{
    if(!Array.isArray(records))return null;
    const projection=projectPayroll(records);
    if(projection.unresolved.some(r=>!r.values?.payDate||r.values.payDate.startsWith(year+'-')))return null;
    const rows=projection.active.filter(r=>r.kind!=='forecast'&&r.values?.payDate?.startsWith(year+'-'));
    if(rows.length<3||!rows[0].incomeSourceId||
       rows.some(r=>r.incomeSourceId!==rows[0].incomeSourceId))return null;
    const samples=[];
    for(const row of rows){
      const lines=(row.payLines||[]).filter(l=>l.category==='weekly_rest'||String(l.code)==='20120');
      let hours=null;
      if(lines.length){
        if(lines.some(l=>!Number.isFinite(l.quantity)||l.quantity<0))return null;
        hours=lines.reduce((a,l)=>a+l.quantity,0);
      }else if(Number.isFinite(row.values?.weeklyRestHours)&&row.values.weeklyRestHours>=0){
        hours=row.values.weeklyRestHours;
      }
      if(hours!==null&&hours>0)samples.push(hours);
    }
    if(samples.length<2)return null;
    const hours=Math.round(samples.reduce((a,b)=>a+b,0)*100)/100;
    return {hours,documents:samples.length,months:new Set(rows.map(r=>r.values.payDate.slice(0,7))).size};
  };
  const selectedCount=()=>{
    if(!proposed)return null;
    const hoursPerWeekend=unit.value.trim()===''?NaN:Number(unit.value);
    if(!Number.isFinite(hoursPerWeekend)||hoursPerWeekend<1||hoursPerWeekend>24)return null;
    const count=Math.round(proposed.hours/hoursPerWeekend);
    return validCount(count)&&count>0?count:null;
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
    const count=selectedCount();
    useProposal.disabled=count===null;
    proposalText.textContent=proposed
      ? 'Viikkolepo '+proposed.hours.toLocaleString('fi-FI')+' h → noin '+(count??'–')+' viikonloppua'
      : '';
    proposalNote.textContent=proposed
      ? proposed.documents+' laskelmaa · '+proposed.months+' palkkakuukautta · Ei skaalattu vuodelle. Tarkista korvaustapa.'
      : '';
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
  useProposal.addEventListener('click',()=>{const count=selectedCount();if(count!==null)void save({done:count});});
  unit.addEventListener('input',show);
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
