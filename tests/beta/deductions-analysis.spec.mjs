import {test,expect} from '@playwright/test';

test('Analysis shows latest four-code payroll deduction percentage and payslip provenance',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/index.html');
  const backup=await page.evaluate(async()=>{
    const m=await import('/model.js');
    const lines=[
      {code:'90100',label:'Synteettinen vähennys',amount:-200,quantity:1},
      {code:'90200',label:'Synteettinen vähennys',amount:-75,quantity:1},
      {code:'90400',label:'Synteettinen vähennys',amount:-20,quantity:1},
      {code:'90920',label:'Synteettinen vähennys',amount:-9.8,quantity:1}
    ];
    const a=m.migrateLegacyRecord({
      recordSchemaVersion:1,id:'deduction-2026-10-09',kind:'payslip',
      values:{payDate:'2026-10-09',payPeriodStart:'2026-09-21',
        payPeriodEnd:'2026-10-04',grossPay:3000,netPay:2100},
      payLines:lines, fingerprints:['deduction-test-2026'],notices:[]
    });
    return JSON.stringify(m.makeBackup([a]));
  });
  await page.getByRole('button',{name:'Asetukset'}).click();
  await page.locator('#backupInput').setInputFiles({
    name:'synthetic-deductions.json',mimeType:'application/json',
    buffer:Buffer.from(backup,'utf8')
  });
  await expect(page.locator('#backupStatus')).toContainText('Palautus valmis');
  await page.getByRole('button',{name:'Analyysi'}).click();
  const summary=page.locator('#analysisMetrics');
  await expect(summary).toContainText('Muut palkkavähennykset');
  await expect(summary.locator('.metric').filter({hasText:'Muut palkkavähennykset'}).locator('strong'))
    .toHaveText('10,16 %');
  await expect(summary.locator('.analysis-deductions-note')).toContainText('09.10.2026');
  await expect(summary.locator('.analysis-deductions-note')).toContainText('90100, 90200, 90400 ja 90920');
  await expect(summary.locator('.analysis-deductions-note')).toContainText('Ei koko vuoden keskiarvo');
  await page.reload();
  await page.getByRole('button',{name:'Analyysi'}).click();
  await expect(page.locator('#analysisMetrics').locator('.metric').filter({hasText:'Muut palkkavähennykset'}).locator('strong'))
    .toHaveText('10,16 %');
});

test('Without four payroll deduction lines Analysis does not invent 10.16% from the gross/net gap',async({page})=>{
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Analyysi'}).click();
  await expect(page.locator('#analysisMetrics').locator('.metric').filter({hasText:'Muut palkkavähennykset'}).locator('strong')).toHaveText('–');
  await expect(page.locator('#analysisMetrics .analysis-deductions-note')).toContainText('Ei täydellistä neljän vähennyskoodin');
});
