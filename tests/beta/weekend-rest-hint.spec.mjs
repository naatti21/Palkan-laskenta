import {test,expect} from '@playwright/test';

const frameOf=page=>page.frameLocator('#plannerFrame');
function backup({rest=[8,8,8,8],source='job'}={}){
  return {
    app:'Palkka PWA',backupSchemaVersion:4,recordSchemaVersion:3,
    incomeSources:[{id:'job',name:'Synteettinen lähde'},{id:'job2',name:'Synteettinen toinen'}],
    records:rest.map((hours,i)=>({
      id:'rest-example-'+i,recordSchemaVersion:3,kind:'payslip',incomeSourceId:source,
      values:{payDate:'2026-'+String(i+1).padStart(2,'0')+'-15',
        payPeriodStart:'2026-'+String(i+1).padStart(2,'0')+'-01',
        payPeriodEnd:'2026-'+String(i+1).padStart(2,'0')+'-14',
        grossPay:3000,netPay:2100,weeklyRestHours:hours},
      payLines:[{code:'20120',label:'Viikkovapaakorvaus',category:'weekly_rest',
        quantity:hours,unitPrice:25,amount:hours*25}]
    }))
  };
}
async function upload(frame,record){
  await frame.locator('#historyInput').setInputFiles({
    name:'synthetic-backup.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(record),'utf8')
  });
}

test('Viikkolepokorvaustunnit ehdottavat vain käyttäjän hyväksymää määrää',async({page})=>{
  await page.setViewportSize({width:360,height:820});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=frameOf(page);
  await expect(frame.locator('#betaWeekendCountHint')).toBeHidden();
  await frame.locator('#betaWeekendsA').fill('2');
  await frame.locator('#betaWeekendsB').fill('9');
  await upload(frame,backup());
  await expect(frame.locator('#betaWeekendCountHint')).toBeVisible();
  await expect(frame.locator('#betaWeekendCountValue')).toHaveText('4 viikonloppua');
  await expect(frame.locator('#betaWeekendCountEvidence')).toContainText('32 viikkolepokorvaustuntia');
  await expect(frame.locator('#betaWeekendCountEvidence')).toContainText('ei todettua työviikonloppumäärää');
  await expect(frame.locator('#betaWeekendsA')).toHaveValue('2');
  await expect(frame.locator('#betaWeekendsB')).toHaveValue('9');
  await frame.locator('#betaApplyWeekendCount').click();
  await expect(frame.locator('#betaWeekendsA')).toHaveValue('4');
  await expect(frame.locator('#betaWeekendsB')).toHaveValue('4');
  await frame.locator('#betaWeekendsB').fill('7');
  await frame.locator('#betaRestHoursPerWeekend').fill('16');
  await expect(frame.locator('#betaWeekendCountValue')).toHaveText('2 viikonloppua');
  await expect(frame.locator('#betaWeekendsA')).toHaveValue('4');
  await expect(frame.locator('#betaWeekendsB')).toHaveValue('7');
  await upload(frame,backup());
  await expect(frame.locator('#betaWeekendsB')).toHaveValue('7');
  await frame.locator('#betaRestHoursPerWeekend').fill('0');
  await expect(frame.locator('#betaApplyWeekendCount')).toBeDisabled();
  await expect(frame.locator('#betaWeekendsB')).toHaveValue('7');
});

test('Puuttuva tai ristiriitainen korvaushavainto ei tuota viikonloppuarvausta',async({page})=>{
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=frameOf(page);
  await upload(frame,backup({rest:[8,0,0,0]}));
  await expect(frame.locator('#betaWeekendCountHint')).toBeHidden();
  const mixed=backup();
  mixed.records[1].incomeSourceId='job2';
  await upload(frame,mixed);
  await expect(frame.locator('#betaWeekendCountHint')).toBeHidden();
});

test('Kompakti näkymä näyttää yhden tarkemman analyysin eikä riko mobiilileveyttä',async({page})=>{
  for(const width of [320,360,412]){
    await page.setViewportSize({width,height:820});
    await page.goto('/index.html');
    await page.getByRole('button',{name:'Laskuri'}).click();
    const frame=frameOf(page);
    await expect(frame.locator('#plannerAdvanced')).toHaveCount(1);
    await expect(frame.locator('#plannerAdvanced')).not.toHaveAttribute('open','');
    await expect(frame.locator('#inverseGoalPanel')).toBeHidden();
    await upload(frame,backup());
    const sizes=await frame.locator('#betaAnnualABSummary').evaluate(el=>({
      viewport:innerWidth,doc:document.documentElement.scrollWidth,
      client:el.clientWidth,scroll:el.scrollWidth
    }));
    expect(sizes.doc,JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.viewport+1);
    expect(sizes.scroll,JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.client+1);
  }
});