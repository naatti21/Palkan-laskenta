import {test,expect} from '@playwright/test';

async function importHistory(page,{rest=[8,8,8,8],mixed=false}={}){
  const payload=await page.evaluate(({rest,mixed})=>{
    const promise=import('/model.js').then(m=>{
      const records=rest.map((hours,i)=>m.migrateLegacyRecord({
        recordSchemaVersion:3,id:'rest-synthetic-'+i,kind:'payslip',
        incomeSourceId:mixed&&i===1?'job2':'job',
        values:{payDate:'2026-'+String(i+1).padStart(2,'0')+'-15',
          payPeriodStart:'2026-'+String(i+1).padStart(2,'0')+'-01',
          payPeriodEnd:'2026-'+String(i+1).padStart(2,'0')+'-14',
          grossPay:3000,netPay:2100,weeklyRestHours:hours},
        payLines:hours>0?[{code:'20120',label:'Viikkovapaakorvaus',category:'weekly_rest',
          quantity:hours,unitPrice:25,amount:hours*25}]:[],
        fingerprints:['rest-synthetic-'+i],fieldMeta:{},corrections:{},notices:[],
        parser:{version:'qa',confidence:1,documentType:'payslip',sourceProfile:'qa'}
      }));
      return JSON.stringify(m.makeBackup(records,{
        incomeSources:[{id:'job',name:'Lähde A'},{id:'job2',name:'Lähde B'}]
      }));
    });
    return promise;
  },{rest,mixed});
  await page.getByRole('button',{name:'Asetukset'}).click();
  await page.locator('#backupInput').setInputFiles({
    name:'rest-synthetic.json',mimeType:'application/json',
    buffer:Buffer.from(payload,'utf8')
  });
  await expect(page.locator('#backupStatus')).toContainText('Palautus valmis');
  await page.getByRole('button',{name:'Analyysi'}).click();
}

test('Viikkolepotuntien ehdotus on vain kompaktissa Analyysin viikonloppuseurannassa',async({page})=>{
  await page.setViewportSize({width:360,height:820});
  await page.clock.install({time:new Date('2026-10-01T12:00:00+03:00')});
  await page.goto('/index.html');
  await importHistory(page);
  const tracker=page.locator('#betaWeekendTracker');
  await expect(tracker).toBeVisible();
  await expect(tracker.locator('.weekend-proposal')).toBeVisible();
  await expect(tracker.locator('.weekend-proposal')).toContainText('32 h');
  await expect(tracker.locator('.weekend-proposal')).toContainText('noin 4 viikonloppua');
  await expect(page.locator('#betaWeekendDone')).toHaveText('–');
  await page.locator('#betaRestHoursPerWeekend').fill('16');
  await expect(tracker.locator('.weekend-proposal')).toContainText('noin 2 viikonloppua');
  await page.locator('#betaWeekendUseProposal').click();
  await expect(page.locator('#betaWeekendDone')).toHaveText('2');
  await page.locator('#betaWeekendTracker summary').click();
  await page.locator('#betaWeekendDoneInput').fill('7');
  await page.locator('#betaWeekendDoneInput').blur();
  await expect(page.locator('#betaWeekendDone')).toHaveText('7');
  await page.reload();
  await page.getByRole('button',{name:'Analyysi'}).click();
  await expect(page.locator('#betaWeekendDone')).toHaveText('7');
  await expect(page.locator('#betaWeekendTracker .weekend-proposal')).toBeVisible();
  await page.getByRole('button',{name:'Laskuri'}).click();
  const planner=page.frameLocator('#plannerFrame');
  await expect(planner.locator('#betaWeekendCountHint')).toHaveCount(0);
  await expect(planner.locator('#betaRestHoursPerWeekend')).toHaveCount(0);
  await expect(planner.locator('#betaWeekendsA')).toBeVisible();
  await expect(planner.locator('#betaWeekendsB')).toBeVisible();
});

test('Riittämättömät viikkolepokorvaustiedot eivät muuta toteumaa',async({page})=>{
  await page.clock.install({time:new Date('2026-10-01T12:00:00+03:00')});
  await page.goto('/index.html');
  await importHistory(page,{rest:[8,0,0,0]});
  await expect(page.locator('#betaWeekendTracker .weekend-proposal')).toBeHidden();
  await expect(page.locator('#betaWeekendDone')).toHaveText('–');
});

test('Useita tulolähteitä ei yhdistetä viikonloppuarvioksi',async({page})=>{
  await page.clock.install({time:new Date('2026-10-01T12:00:00+03:00')});
  await page.goto('/index.html');
  await importHistory(page,{mixed:true});
  await expect(page.locator('#betaWeekendTracker .weekend-proposal')).toBeHidden();
});

test('Tiivis Analyysi ja laskuri eivät ylitä puhelimen leveyttä',async({page})=>{
  for(const width of [320,360,412]){
    await page.setViewportSize({width,height:820});
    await page.goto('/index.html');
    await page.getByRole('button',{name:'Analyysi'}).click();
    await expect(page.locator('#betaWeekendTracker')).toBeVisible();
    const analysisWidth=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(analysisWidth).toBeLessThanOrEqual(1);
    await page.getByRole('button',{name:'Laskuri'}).click();
    const planner=page.frameLocator('#plannerFrame');
    await expect(planner.locator('#plannerAdvanced')).toHaveCount(1);
    await expect(planner.locator('#betaWeekendCountHint')).toHaveCount(0);
    const plannerWidth=await planner.locator('#betaAnnualABSummary').evaluate(el=>({
      viewport:innerWidth,document:document.documentElement.scrollWidth,
      content:el.scrollWidth,client:el.clientWidth
    }));
    expect(plannerWidth.document).toBeLessThanOrEqual(plannerWidth.viewport+1);
    expect(plannerWidth.content).toBeLessThanOrEqual(plannerWidth.client+1);
  }
});
