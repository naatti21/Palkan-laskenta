import {test,expect} from '@playwright/test';

// Synthetic amounts only; never use users' imported payslips in tests.
const payroll=(count=3,{source="job",includeKta=true}={})=>({
  app:"Palkka PWA",backupSchemaVersion:4,recordSchemaVersion:3,
  incomeSources:[{id:"job",name:"Synthetic A"},{id:"job-b",name:"Synthetic B"}],
  records:Array.from({length:count},(_,i)=>{
    const month=String(i+1).padStart(2,"0");
    return {
      id:"synthetic-"+i,recordSchemaVersion:3,kind:"payslip",incomeSourceId:source,
      values:{payDate:"2026-"+month+"-09",payPeriodStart:"2026-"+month+"-01",
        payPeriodEnd:"2026-"+month+"-08",grossPay:3400,netPay:2300,
        ytdTaxableIncome:3400*(i+1),...(includeKta?{kta:25.07}:{})},
      payLines:[{code:"13001",label:"Palkkiotyö",quantity:80,amount:1960.80}]
    };
  })
});
const upload=async(frame,backup)=>{
  await frame.locator('#historyInput').setInputFiles({
    name:'synthetic-local-backup.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(backup),'utf8')
  });
};

test('16 h gross suggestion from local payslips requires user approval and keeps manual model',async({page})=>{
  await page.setViewportSize({width:360,height:860});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await expect(frame.locator('#weekendDataGross')).toHaveText('–');
  await expect(frame.locator('#weekendUseHistoryGross')).toBeDisabled();
  await upload(frame,payroll());
  await expect(frame.locator('#historyStatus')).toContainText('Varmuuskopio luettu onnistuneesti');
  await expect(frame.locator('#weekendDataGross')).toContainText('1 094');
  await expect(frame.locator('#weekendDataExplanation')).toContainText('tuntipalkka 24,51');
  await expect(frame.locator('#weekendDataExplanation')).toContainText('KTA 25,07');
  await expect(frame.locator('#weekendDataExplanation')).toContainText('3 havaintoa');
  await expect(frame.locator('#weekendDataExplanation')).toContainText('viikkovapaa');
  await expect(frame.locator('#weekendDataExplanation')).toContainText('Ei havaittu toteutunut');
  await expect(frame.locator('#weekendGross')).toHaveValue('0');
  await expect(frame.locator('#weekendUseHistoryGross')).toBeDisabled();
  await frame.locator('#weekendPayDetails').evaluate(el=>el.open=true);
  await frame.locator('#rulesConfirmed').check();
  await expect(frame.locator('#weekendUseHistoryGross')).toBeEnabled();
  await frame.locator('#weekendUseHistoryGross').click();
  await expect(frame.locator('#weekendGross')).toHaveValue('1094.12');
  await expect(frame.locator('#weekendMethod')).toHaveValue('manual');
  await expect(frame.locator('#weekendBreakdown')).toContainText('1 094');
  await expect(frame.locator('#weekendDataExplanation')).toContainText('Ehdotus siirretty');
  // After approving once, the user can still override the amount.
  await frame.locator('#weekendGross').fill('1200');
  await expect(frame.locator('#weekendGross')).toHaveValue('1200');
  await expect(frame.locator('#weekendBreakdown')).toContainText('1 200');
});

test('incomplete or ambiguous wage evidence never produces an automatic 16 h amount',async({page})=>{
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await upload(frame,payroll(2));
  await expect(frame.locator('#weekendDataGross')).toHaveText('–');
  await expect(frame.locator('#weekendUseHistoryGross')).toBeDisabled();
  await expect(frame.locator('#weekendDataExplanation')).toContainText('Ei riittävää');
  await upload(frame,payroll(3,{includeKta:false}));
  await expect(frame.locator('#weekendDataGross')).toHaveText('–');
  await expect(frame.locator('#weekendUseHistoryGross')).toBeDisabled();
  await expect(frame.locator('#weekendGross')).toHaveValue('0');
});

test('16 h evidence and approval remain usable without mobile horizontal overflow',async({page})=>{
  for(const width of [320,360,412]){
    await page.setViewportSize({width,height:860});
    await page.goto('/index.html');
    await page.getByRole('button',{name:'Laskuri'}).click();
    const frame=page.frameLocator('#plannerFrame');
    await upload(frame,payroll());
    await expect(frame.locator('#weekendDataGross')).toContainText('1 094');
    const geometry=await frame.locator('#weekendDataSuggestion').evaluate(el=>({
      viewport:innerWidth,body:document.documentElement.scrollWidth,
      cardWidth:el.clientWidth,cardScroll:el.scrollWidth
    }));
    expect(geometry.cardScroll,JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.cardWidth+1);
    expect(geometry.body,JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport+1);
  }
});
