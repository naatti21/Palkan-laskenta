import {test,expect} from '@playwright/test';

test('Analyysissä on vain avattaessa näkyvä 48 h työaikasääntö ja oikea TES-rajaus',async({page})=>{
  await page.setViewportSize({width:360,height:820});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Analyysi'}).click();
  await page.getByRole('button',{name:'Ylityöt',exact:true}).click();
  const law=page.locator('#betaWorkTimeLaw');
  await expect(law).toHaveCount(1);
  await expect(law).not.toHaveAttribute('open','');
  await expect(law.locator('summary')).toContainText('Ylityöt ja työajan enimmäismäärä');
  await law.locator('summary').click();
  await expect(law.locator('#betaWorkTimeCapacity')).toContainText('Ei laskettavissa');
  await expect(law).toContainText('48 h viikossa');
  await expect(law).toContainText('neljän kuukauden');
  await expect(law).toContainText('Teknologiateollisuuden työntekijöiden TES 2025–2027');
  await expect(law).toContainText('vain, jos juuri tämä TES koskee');
  await expect(law.locator('a[href*="finlex.fi"]')).toHaveCount(1);
  await expect(law.locator('a[href*="teollisuusliitto.fi"]')).toHaveCount(1);
  await expect(law.locator('#betaWorkTimeObserved')).toContainText('Ei luotettavia ylityötuntihavaintoja');
});

test('Ylityöhavaintoja ei tulkita sallituiksi lisätunneiksi tai täydelliseksi työaikakirjanpidoksi',async({page})=>{
  await page.clock.install({time:new Date('2026-11-20T12:00:00+02:00')});
  await page.goto('/index.html');
  await page.evaluate(async()=>{
    const storage=await import('/storage.js');
    const source=await storage.createIncomeSource('Synteettinen testilähde');
    await storage.upsertRecord({
      id:'worklaw-paid-1',recordSchemaVersion:3,incomeSourceId:source.id,kind:'payslip',
      values:{payDate:'2026-09-15',payPeriodStart:'2026-08-30',
        payPeriodEnd:'2026-09-13',grossPay:2800,netPay:1900,overtimeHours:12.5}
    });
    await storage.upsertRecord({
      id:'worklaw-paid-2',recordSchemaVersion:3,incomeSourceId:source.id,kind:'payslip',
      values:{payDate:'2026-10-15',payPeriodStart:'2026-09-28',
        payPeriodEnd:'2026-10-11',grossPay:2800,netPay:1900,overtimeHours:null}
    });
  });
  await page.reload();
  await page.getByRole('button',{name:'Analyysi'}).click();
  await page.getByRole('button',{name:'Ylityöt',exact:true}).click();
  const law=page.locator('#betaWorkTimeLaw');
  await law.locator('summary').click();
  await expect(law.locator('#betaWorkTimeObserved')).toContainText('12,5 h');
  await expect(law.locator('#betaWorkTimeObserved')).toContainText('osittainen tieto');
  await expect(law.locator('#betaWorkTimeCoverage')).toContainText('1/2');
  await expect(law.locator('#betaWorkTimeCoverage')).toContainText('Maksuvuosi ei kerro');
  await expect(law.locator('#betaWorkTimeCapacity')).toContainText('Ei laskettavissa');
  await expect(law).not.toContainText('Saa tehdä vielä');
});

test('Avattava työaikaosio pysyy 320–412 px mobiilileveydellä ja suuremmalla tekstillä',async({page})=>{
  for(const width of [320,360,412]){
    await page.setViewportSize({width,height:820});
    await page.goto('/index.html');
    await expect(page.locator('#dashboardYear option').first()).toBeAttached();
    await page.getByRole('button',{name:'Analyysi'}).click();
    await page.getByRole('button',{name:'Ylityöt',exact:true}).click();
    await page.locator('#betaWorkTimeLaw summary').click();
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    const size=await page.evaluate(()=>({
      viewport:innerWidth,
      doc:document.documentElement.scrollWidth,
      panel:document.getElementById('betaWorkTimeLaw').getBoundingClientRect().right
    }));
    expect(size.doc,JSON.stringify(size)).toBeLessThanOrEqual(size.viewport+1);
    expect(size.panel,JSON.stringify(size)).toBeLessThanOrEqual(size.viewport+1);
  }
});
