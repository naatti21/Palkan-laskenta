// Run against a local Beta build served at the configured origin.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { makeTextPdf } from '../../tests/staging/pdf-helper.mjs';
const output=process.argv[2];
if (!output) throw Error('Provide a screenshot output directory.');
const browser=await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH,args:['--disable-gpu']} : {});
await mkdir(output,{recursive:true});
const checks=[];
let buildCommit;
try {
 for(const width of [320,360,390,412]){
  const context=await browser.newContext({viewport:{width,height:840},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage(); await page.goto('http://127.0.0.1:4177');
  buildCommit = (await (await page.request.get(new URL('/build-info.json',page.url()).href)).json()).commit;
  await page.screenshot({path:output+'/empty-'+width+'.png'});
  await page.evaluate(async()=>{
   const db=await import('/storage.js');
   const source=await db.createIncomeSource('Päätyö');
   for(const [month,gross,net,ytd] of [['08',3000,2250,24000],['09',3250,2380,27250],['10',3470,2500,30720]]){
    await db.upsertRecord({recordSchemaVersion:3,id:'qa-'+month,incomeSourceId:source.id,values:{
     payDate:'2026-'+month+'-28',payPeriodStart:'2026-'+month+'-01',payPeriodEnd:'2026-'+month+'-15',
     grossPay:gross,netPay:net,ytdTaxableIncome:ytd,taxCardAccumulatedIncome:ytd,taxLimit:48000,taxRate:20,additionalRate:40}});
   }
  });
  await page.reload();await page.locator('#dashboard .metric').first().waitFor();
  async function capture(name,anchor){
   await anchor.evaluate(e=>window.scrollTo({top:Math.max(0,e.getBoundingClientRect().top+scrollY-document.querySelector('.tabs').offsetHeight-10),behavior:'instant'}));
   if(!['conflict','pdf','calendar'].includes(name)) await page.evaluate(()=>window.scrollTo(0,0));
   await page.evaluate(()=>document.fonts.ready);
   const layout=await page.evaluate(()=>{
    const controls=[...document.querySelectorAll('.tab,button,input:not([type=hidden]):not([type=file]),select,summary,.file-button')].filter(e=>e.getBoundingClientRect().width&&getComputedStyle(e).visibility!=='hidden');
    const firstScreen = {};
    const nav = document.querySelector('.tabs').getBoundingClientRect();
    for(const selector of ['.compact-amount','#dashboard','#taxCardRemaining','#taxCardEstimate','.beta-pdf-slot','#replacementTarget','#cancelConflictButton']) {
      const rect=document.querySelector(selector)?.getBoundingClientRect();
      firstScreen[selector]=Boolean(rect?.height && rect.top>=0 && rect.bottom<=Math.min(innerHeight,nav.top>innerHeight/2?nav.top:innerHeight));
    }
    return {height:innerHeight,scrollTop:scrollY,firstScreen,header:Math.round(document.querySelector('.hero').getBoundingClientRect().height), pageHeight:document.documentElement.scrollHeight, overflow:document.documentElement.scrollWidth-innerWidth,small:controls.filter(e=>e.getBoundingClientRect().height<24||e.getBoundingClientRect().width<24).map(e=>e.id||e.textContent.trim().slice(0,30)),tabs:[...document.querySelectorAll('.tab')].map(e=>Math.round(e.getBoundingClientRect().height))};
   });
   if(name==='calculator')layout.iframeOverflow=await page.frameLocator('#plannerFrame').locator('html').evaluate(e=>e.scrollWidth-e.clientWidth);
   if(name==='calculator') layout.overhang=await page.frameLocator('#plannerFrame').locator('html').evaluate(root=>{window.scrollTo(0,scrollY);const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const hits=[];while(walker.nextNode()){const range=document.createRange();range.selectNodeContents(walker.currentNode);if(range.getBoundingClientRect().right>root.clientWidth+1)hits.push([walker.currentNode.parentElement.tagName,walker.currentNode.parentElement.className,walker.currentNode.textContent.trim().slice(0,50)]);}return hits.slice(0,12)});
   if(process.env.AXE_PATH && width===360){
    layout.accessibility=[];
    const position=await page.evaluate(()=>scrollY);
    await page.evaluate(()=>window.scrollTo(0,0));
    for(const frame of (name==='calculator'?page.frames():[page.mainFrame()])){
     await frame.addScriptTag({path:process.env.AXE_PATH});
     const result=await frame.evaluate(async()=>{const r=await axe.run(document,{iframes:false,runOnly:['color-contrast','target-size']});return r.violations.map(rule=>({id:rule.id,nodes:rule.nodes.map(n=>[n.target,n.any.map(check=>check.data)])}));});
     layout.accessibility.push(...result);
    }
    await page.evaluate(top=>window.scrollTo(0,top),position);
   }
   checks.push({buildCommit,width,name,...layout});
   await page.screenshot({path:output+'/'+name+'-'+width+'.png',animations:'disabled'});
  }
  for(const [label,name,selector] of [['Seuranta','tracking','#ledgerOpening'],['Historia','history','[data-view="history"]'],['Analyysi','analysis','[data-view="analysis"]'],['Laskuri','calculator','[data-view="planning"]'],[/^(Data|Asetukset)$/,'settings','[data-view="data"]']]){
   await page.getByRole('button',{name:label,exact:true}).click();
   if(name==='calculator') await page.frameLocator('#plannerFrame').locator('#historyStatus').filter({hasText:/Beta|historia/i}).waitFor();
   await capture(name,page.locator(selector));
   if(name==='history'){
     await page.getByRole('button',{name:'Kalenteri',exact:true}).click();
     await capture('calendar',page.locator('#ledgerCalendar'));
   }
  }
  await page.getByRole('button',{name:'Seuranta',exact:true}).click();
  await capture('pdf',page.locator('.beta-pdf-slot'));
  await page.locator('#pdfInput').setInputFiles({name:'synteettinen.pdf',mimeType:'application/pdf',buffer:makeTextPdf([
   'PALKKALASKELMA','Palkkakausi 1.10.2026 - 15.10.2026','Maksupäivä 28.10.2026','Maksetaan 2 580,00',
   'KERTYMÄ PALKKAKAUDELTA','Ennakonpid. al. tul 3 500,00','Ennakonpidätys -800,00','Maksetaan 2 580,00',
   'KERTYMÄ VUODEN ALUSTA','Ennakonpid. al. tul 30 750,00','Ennakonpidätys -6 400,00'])});
  await page.locator('#replacementTarget').waitFor();
  await capture('conflict',page.locator('#conflictSection'));
  await context.close();
 }
 await writeFile(output+'/checks.json',JSON.stringify(checks,null,2));
} finally {await browser.close()}
