// Local-only worktime journal. Weekly totals are manually confirmed, not
// derived from pay-date overtime rows. A 17-week window is an indicator,
// NEVER a statutory four-calendar-month calculation.
import {getSetting,setSetting} from './storage.js';
import {WORKTIME_KEY,WORKTIME_MODE_KEY,validHours,normalizeWeeks,mondayOf,plusDays,
        lastCompletedMonday,analyzeWeeks} from './beta-worktime-model.mjs';

const el=(tag,text='',cls='')=>{
  const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;
};
const fmt=n=>n===null?'–':new Intl.NumberFormat('fi-FI',{maximumFractionDigits:2}).format(n);
const today=()=>{
  const d=new Date(),p=x=>String(x).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
};
const shortDate=s=>s?s.slice(8)+'.'+s.slice(5,7)+'.':'–';
const keyYear=week=>Number(week.slice(0,4));

export function installWorktimeJournal(parent){
  if(!parent||document.getElementById('betaWorkHoursJournal'))return;
  const host=el('section','','beta-workhours-journal');
  host.id='betaWorkHoursJournal';
  host.append(el('h3','Omat toteutuneet viikkotunnit'));
  host.append(el('p','Kirjaa viikon kaikki tehdyt työtunnit (normaali + lisä- ja ylityö). Palkkalaskelmien ylityötunteja ei lisätä automaattisesti.','beta-workhours-mini'));

  const modeLabel=el('label','Tarkastelutapa');
  const modeSelect=el('select');modeSelect.id='betaWorkHoursMode';
  const a=new Option('Työaikalaki · 4 kk (17 vkon suunta)','law');
  const b=new Option('Teknologiateollisuuden TES · vuosijakso','tes');
  modeSelect.add(a,b);modeLabel.append(modeSelect);
  const progress=el('p','Ei viikkotyötuntikirjauksia.','beta-workhours-progress');
  progress.id='betaWorkHoursProgress';
  const yearProgress=el('p','','beta-workhours-mini');yearProgress.id='betaWorkHoursYearProgress';
  const warning=el('p','','beta-workhours-warning');warning.id='betaWorkHoursWarning';
  host.append(modeLabel,progress,yearProgress,warning);

  const entry=el('div','','beta-workhours-entry');
  const weekLabel=el('label','Viikon alkupäivä');
  const weekDate=el('input');weekDate.type='date';weekDate.id='betaWorkHoursWeek';
  weekDate.min='2020-01-01';weekDate.max=today();
  weekLabel.append(weekDate);
  const hoursLabel=el('label','Tunnit yhteensä');
  const hours=el('input');hours.type='number';hours.inputMode='decimal';
  hours.id='betaWorkHoursHours';hours.min='0';hours.max='168';hours.step='0.25';
  hours.placeholder='esim. 56';
  hoursLabel.append(hours);
  const save=el('button','Tallenna','secondary');save.type='button';save.id='betaWorkHoursSave';
  entry.append(weekLabel,hoursLabel,save);
  const actions=el('div','','beta-workhours-actions');
  const preset=el('button','40 h perusviikko','secondary');preset.type='button';preset.id='betaWorkHours40';
  const deleteWeek=el('button','Poista valittu','secondary');deleteWeek.type='button';deleteWeek.id='betaWorkHoursDelete';
  actions.append(preset,deleteWeek);
  host.append(entry,actions);
  const status=el('p','','beta-workhours-status');status.id='betaWorkHoursStatus';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  host.append(status);

  const scenario=el('div','','beta-workhours-scenario');
  scenario.append(el('strong','Entä seuraava viikko?'));
  const future=el('label','Suunnitellut tunnit');
  const planned=el('input');planned.id='betaWorkHoursPlan';planned.type='number';
  planned.inputMode='decimal';planned.min='0';planned.max='168';planned.step='0.25';
  planned.placeholder='esim. 56';future.append(planned);
  const forecast=el('p','Kirjaa ensin 16 peräkkäistä täyttä viikkoa, niin vertailu toimii.','beta-workhours-mini');
  forecast.id='betaWorkHoursForecast';
  scenario.append(future,forecast);
  host.append(scenario);

  const recent=el('div','','beta-workhours-recent');
  recent.id='betaWorkHoursRecent';host.append(recent);
  const backup=el('div','','beta-workhours-backup');
  const exportButton=el('button','Vie viikkotunnit','secondary');
  exportButton.type='button';exportButton.id='betaWorkHoursExport';
  const importButton=el('button','Palauta viikkotunnit','secondary');
  importButton.type='button';importButton.id='betaWorkHoursImportButton';
  const file=document.createElement('input');file.type='file';file.accept='application/json,.json';
  file.id='betaWorkHoursImport';file.hidden=true;
  backup.append(exportButton,importButton,file);host.append(backup);
  host.append(el('p','Suuntalaskelma, ei ylityölupa. 17 viikkoa ei ole täsmälleen lain neljä kalenterikuukautta. TES:n todellinen vuositarkastelu voi alkaa palkanmaksukaudesta; vuosirajan viikot jäävät tässä vertailussa osittain ulkopuolelle. Myös lepoajat ja työvuorot on varmistettava.','beta-workhours-mini'));
  parent.prepend(host);
  const css=document.createElement('style');
  css.textContent=`
    #betaWorkHoursJournal{border-bottom:1px solid #34505d;padding-bottom:10px;margin-bottom:12px;min-width:0}
    #betaWorkHoursJournal h3{margin:3px 0 5px;font-size:.88rem}
    #betaWorkHoursJournal p{overflow-wrap:anywhere}
    #betaWorkHoursJournal label{font-size:.74rem;display:grid;gap:4px;min-width:0}
    #betaWorkHoursJournal select,#betaWorkHoursJournal input{box-sizing:border-box;min-width:0;width:100%;padding:7px;border-radius:7px;font-size:.87rem;background:#101b25;color:#f3f7fd;border:1px solid #496172}
    #betaWorkHoursJournal .beta-workhours-entry{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);align-items:end;gap:7px;margin:8px 0}
    #betaWorkHoursJournal .beta-workhours-entry button{grid-column:1/-1}
    #betaWorkHoursJournal button{min-height:34px;padding:6px 10px;font-size:.76rem;max-width:100%;overflow-wrap:anywhere}
    #betaWorkHoursJournal .beta-workhours-actions,#betaWorkHoursJournal .beta-workhours-backup{display:flex;gap:7px;flex-wrap:wrap;margin:7px 0}
    #betaWorkHoursJournal .beta-workhours-mini{font-size:.71rem;line-height:1.42;margin:5px 0;color:#bfd0dc}
    #betaWorkHoursJournal .beta-workhours-progress{margin:10px 0 4px;font-size:.82rem;font-weight:650}
    #betaWorkHoursJournal .beta-workhours-warning{font-size:.75rem;color:#f5d7b0;border-left:2px solid #caa577;padding-left:7px;margin:6px 0 8px}
    #betaWorkHoursJournal .beta-workhours-status{font-size:.72rem;line-height:1.4;margin:5px 0}
    #betaWorkHoursJournal .beta-workhours-scenario{border-top:1px solid #34505d;margin-top:11px;padding-top:9px}
    #betaWorkHoursJournal .beta-workhours-scenario>strong{font-size:.82rem}
    #betaWorkHoursJournal .beta-workhours-scenario label{margin-top:6px}
    #betaWorkHoursJournal .beta-workhours-recent{margin-top:8px;display:grid;gap:2px}
    #betaWorkHoursJournal .beta-workhours-row{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px 0;border-top:1px solid #2e424d}
    #betaWorkHoursJournal .beta-workhours-row span{font-size:.75rem}
    #betaWorkHoursJournal .beta-workhours-row button{min-height:30px;flex:0 0 auto}
    @media(min-width:480px){#betaWorkHoursJournal .beta-workhours-entry{grid-template-columns:1.2fr .8fr auto}#betaWorkHoursJournal .beta-workhours-entry button{grid-column:auto}}
  `;
  document.head.append(css);

  const analysisYear=document.getElementById('analysisYear');
  let weeks={},mode='law',activeYear=Number(analysisYear?.value)||new Date().getFullYear();
  let pending=Promise.resolve(),generation=0;
  const selectedDefault=()=>{
    const last=lastCompletedMonday(today());
    const cap=mondayOf(String(activeYear)+'-12-31');
    return activeYear<Number(today().slice(0,4))?cap:last;
  };
  function chooseWeek(week){
    weekDate.value=week||selectedDefault();
    const row=weeks[weekDate.value];
    hours.value=validHours(row)?String(row):'';
  }
  function render(){
    const todayKey=today();
    const calc=analyzeWeeks(weeks,{year:activeYear,today:todayKey,
      plannedHours:planned.value.trim()?Number(planned.value):null});
    modeSelect.value=mode;
    const avg=calc.observedAverage===null?'–':fmt(calc.observedAverage)+' h/vko';
    progress.textContent=calc.covered+'/17 täyttä viikkoa kirjattu · kirjattujen keskiarvo '+avg;
    yearProgress.textContent='Valitun vuoden tähänastiset kokonaiset viikot: '+
      calc.yearCovered+'/'+calc.yearExpected+' · kirjattu '+fmt(calc.yearTotal)+' h'+
      (calc.yearAverage===null?'':'; näissä keskimäärin '+fmt(calc.yearAverage)+' h/vko')+'.';
    if(calc.rollingAverage!==null){
      warning.textContent='17 viikon suunta: '+fmt(calc.rollingAverage)+' h/vko · ero 48 h viitearvoon '+
        (calc.rollingDifference>=0?'+':'')+fmt(calc.rollingDifference)+' h koko vertailujaksolla. '+
        (calc.rollingDifference<0?'Vertailuarvo ylittyy.':'Tämä ei ole lupa lisätyöhön.');
    }else{
      warning.textContent='17 viikon vertailusta puuttuu '+calc.missing+
        ' viikkoa. Ei luotettavaa 48 h keskiarvoa tai jäljellä olevaa tuntimäärää.';
    }
    if(mode==='tes'){
      yearProgress.textContent+=' TES:n vuositarkastelu edellyttää koko jakson sekä rajaviikkojen työtuntitiedot.';
    }else{
      yearProgress.textContent+=' Lain tarkka 4 kk jakso ei vastaa kiinteää 17 viikon vertailua.';
    }
    const planEntered=planned.value.trim()!=='';
    if(!planEntered){
      forecast.textContent='Syötä suunniteltu viikon kokonaistyöaika. Vertailu näytetään vasta, kun edeltävät 16 viikkoa on kirjattu.';
    }else if(!validHours(Number(planned.value))){
      forecast.textContent='Anna suunnitellut tunnit väliltä 0–168 (0,25 h tarkkuudella).';
    }else if(calc.planAverage===null){
      forecast.textContent='Vertailua ei voi laskea: edeltävistä 16 kokonaisesta viikosta puuttuu tunteja.';
    }else{
      forecast.textContent='Jos seuraava viikko on '+fmt(Number(planned.value))+' h, 17 viikon suunta olisi '+
        fmt(calc.planAverage)+' h/vko (ero 48 h viitearvoon '+
        (calc.planDifference>=0?'+':'')+fmt(calc.planDifference)+' h). '+
        'Tämä ei tarkista lain neljän kuukauden eikä TES:n vuoden rajoja.';
    }
    const selected=weekDate.value;
    save.disabled=!selected||keyYear(selected)!==activeYear||
      selected>todayKey||!hours.value.trim()||!validHours(Number(hours.value));
    deleteWeek.disabled=!Object.hasOwn(weeks,selected);
    recent.replaceChildren();
    recent.append(el('strong','Viimeisimmät omat viikkokirjaukset'));
    const rows=Object.entries(weeks).filter(([k])=>keyYear(k)===activeYear)
      .sort((a,b)=>b[0].localeCompare(a[0])).slice(0,8);
    if(!rows.length)recent.append(el('p','Ei vielä tämän vuoden viikkokirjauksia.','beta-workhours-mini'));
    for(const [k,n] of rows){
      const item=el('div','','beta-workhours-row');
      const label=el('span',shortDate(k)+'–'+shortDate(plusDays(k,6))+' · '+fmt(n)+' h');
      const edit=el('button','Muokkaa','secondary');edit.type='button';
      edit.addEventListener('click',()=>{chooseWeek(k);weekDate.focus();render();});
      item.append(label,edit);recent.append(item);
    }
  }
  async function commit(next,notice){
    weeks=normalizeWeeks(next);render();
    pending=pending.catch(()=>{}).then(()=>setSetting(WORKTIME_KEY,weeks));
    try{await pending;status.textContent=notice;return true;}
    catch{status.textContent='Tallennus epäonnistui. Tarkista laitteen tallennustila.';return false;}
  }
  weekDate.addEventListener('change',()=>{
    const mon=mondayOf(weekDate.value);
    if(mon)chooseWeek(mon);
    else hours.value='';
    status.textContent='';render();
  });
  hours.addEventListener('input',render);
  planned.addEventListener('input',render);
  preset.addEventListener('click',()=>{hours.value='40';render();});
  save.addEventListener('click',()=>{
    const mon=mondayOf(weekDate.value),value=hours.value.trim()?Number(hours.value):NaN;
    if(!mon||mon!==weekDate.value||keyYear(mon)!==activeYear||
       mon>today()||!validHours(value)){
      status.textContent='Tarkista viikko ja tuntimäärä (0–168 h, 15 minuutin välein).';
      return;
    }
    void commit({...weeks,[mon]:value},'Viikko '+shortDate(mon)+' tallennettu paikallisesti.');
  });
  deleteWeek.addEventListener('click',()=>{
    const selected=weekDate.value;
    if(!Object.hasOwn(weeks,selected))return;
    if(!window.confirm('Poistetaanko viikon '+shortDate(selected)+' tuntikirjaus?'))return;
    const updated={...weeks};delete updated[selected];
    hours.value='';
    void commit(updated,'Viikkokirjaus poistettu.');
  });
  modeSelect.addEventListener('change',async()=>{
    mode=modeSelect.value==='tes'?'tes':'law';render();
    try{await setSetting(WORKTIME_MODE_KEY,mode);status.textContent='Tarkastelutapa tallennettu.';}
    catch{status.textContent='Tarkastelutapaa ei voitu tallentaa.';}
  });
  exportButton.addEventListener('click',()=>{
    const payload={app:'Palkka Beta viikkotunnit',version:1,
      exportedAt:new Date().toISOString(),weeks:normalizeWeeks(weeks)};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);
    link.download='palkka-viikkotunnit-'+today()+'.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),0);
    status.textContent='Viikkotuntien varmuuskopio luotu. Säilytä se muualla kuin tässä puhelimessa.';
  });
  importButton.addEventListener('click',()=>file.click());
  file.addEventListener('change',async()=>{
    const f=file.files?.[0];if(!f)return;
    try{
      if(f.size>300000)throw new Error('Tiedosto on liian suuri.');
      const payload=JSON.parse(await f.text());
      if(payload?.app!=='Palkka Beta viikkotunnit'||payload.version!==1||
         !payload.weeks||Array.isArray(payload.weeks)||typeof payload.weeks!=='object')
        throw new Error('Tämä ei ole viikkotuntien varmuuskopio.');
      const entries=Object.entries(payload.weeks);
      if(entries.length>800||entries.some(([k,n])=>mondayOf(k)!==k||!validHours(n)))
        throw new Error('Varmuuskopion viikkotunnit eivät ole kelvollisia.');
      if(entries.some(([k,n])=>Object.hasOwn(weeks,k)&&weeks[k]!==n))
        throw new Error('Varmuuskopio sisältää eri määrän jo kirjatulle viikolle. Korjaa ristiriita ensin käsin.');
      if(entries.length){
        await commit({...weeks,...payload.weeks},'Palautettu '+entries.length+' viikkokirjausta ilman olemassa olevien arvojen ylikirjoitusta.');
        chooseWeek(weekDate.value);render();
      }else status.textContent='Varmuuskopiossa ei ollut kirjauksia.';
    }catch(error){status.textContent=error?.message||'Viikkotuntien palautus epäonnistui.';}
    finally{file.value='';}
  });
  const switchYear=year=>{
    if(!Number.isInteger(year)||year<2020||year>2100||year===activeYear)return;
    activeYear=year;planned.value='';chooseWeek(selectedDefault());render();
  };
  analysisYear?.addEventListener('change',()=>switchYear(Number(analysisYear.value)));
  document.addEventListener('compact-payments',e=>switchYear(Number(e.detail?.year)));
  const init=async()=>{
    const g=++generation;
    try{
      const [saved,setting]=await Promise.all([getSetting(WORKTIME_KEY),getSetting(WORKTIME_MODE_KEY)]);
      if(g!==generation)return;
      weeks=normalizeWeeks(saved);mode=setting==='tes'?'tes':'law';
      chooseWeek(selectedDefault());render();
    }catch{chooseWeek(selectedDefault());render();status.textContent='Viikkokirjauksia ei voitu lukea paikallisesta tallennuksesta.';}
  };
  chooseWeek(selectedDefault());render();void init();
}
