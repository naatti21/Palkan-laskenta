import {test,expect} from '@playwright/test';
const day=new Date('2026-11-20T12:00:00+02:00');
async function openLaw(page){
  await page.getByRole('button',{name:'Analyysi'}).click();
  await page.locator('#betaWorkTimeLaw > summary').click();
  await expect(page.locator('#betaWorkHoursJournal')).toBeVisible();
}
test('tallentaa viikon todelliset kokonaistunnit local-first ja säilyttää vuoden vaihdon',async({page})=>{
  await page.clock.install({time:day});
  await page.setViewportSize({width:360,height:820});
  await page.goto('/index.html');await openLaw(page);
  await expect(page.locator('#betaWorkHoursProgress')).toContainText('0/17');
  await expect(page.locator('#betaWorkHoursWarning')).toContainText('Ei luotettavaa');
  await expect(page.locator('#betaWorkHoursWeek')).toHaveValue('2026-11-09');
  await page.locator('#betaWorkHoursHours').fill('56');
  await page.locator('#betaWorkHoursSave').click();
  await expect(page.locator('#betaWorkHoursStatus')).toContainText('tallennettu paikallisesti');
  await expect(page.locator('#betaWorkHoursProgress')).toContainText('1/17');
  await expect(page.locator('#betaWorkHoursProgress')).toContainText('56 h/vko');
  await expect(page.locator('#betaWorkHoursWarning')).toContainText('puuttuu 16 viikkoa');
  await expect(page.locator('#betaWorkTimeCapacity')).toContainText('Ei laskettavissa');
  await page.locator('#betaWorkHoursMode').selectOption('tes');
  await expect(page.locator('#betaWorkHoursYearProgress')).toContainText('TES:n vuositarkastelu');
  await page.reload();await openLaw(page);
  await expect(page.locator('#betaWorkHoursHours')).toHaveValue('56');
  await expect(page.locator('#betaWorkHoursProgress')).toContainText('1/17');
  await expect(page.locator('#betaWorkHoursMode')).toHaveValue('tes');
  const saved=await page.evaluate(async()=>{
    const {getSetting}=await import('/storage.js');
    return getSetting('beta:worktime:weeks:v1');
  });
  expect(saved['2026-11-09']).toBe(56);
  await page.locator('#betaWorkHoursHours').fill('55.1');
  await expect(page.locator('#betaWorkHoursSave')).toBeDisabled();
  await page.locator('#betaWorkHoursHours').fill('0');
  await expect(page.locator('#betaWorkHoursSave')).toBeEnabled();
  await page.locator('#betaWorkHoursSave').click();
  await expect(page.locator('#betaWorkHoursStatus')).toContainText('tallennettu');
  await expect(page.locator('#betaWorkHoursProgress')).toContainText('0 h/vko');
});
test('17 täyttä viikkoa mahdollistaa vain suuntaa-antavan lisäviikon testin',async({page})=>{
  await page.clock.install({time:day});await page.goto('/index.html');
  await page.evaluate(async()=>{
    const {setSetting}=await import('/storage.js');
    const {plusDays}=await import('/beta-worktime-model.mjs');
    const weeks={};
    for(let i=0;i<17;i++)weeks[plusDays('2026-11-09',-i*7)]=40;
    weeks['2026-11-16']=8; // current/incomplete week: must not distort history
    await setSetting('beta:worktime:weeks:v1',weeks);
  });
  await page.reload();await openLaw(page);
  await expect(page.locator('#betaWorkHoursProgress')).toContainText('17/17');
  await expect(page.locator('#betaWorkHoursWarning')).toContainText('40 h/vko');
  await expect(page.locator('#betaWorkHoursWarning')).toContainText('+136 h');
  await page.locator('#betaWorkHoursPlan').fill('56');
  await expect(page.locator('#betaWorkHoursForecast')).toContainText('40,94 h/vko');
  await expect(page.locator('#betaWorkHoursForecast')).toContainText('+120 h');
  await expect(page.locator('#betaWorkHoursForecast')).toContainText('ei tarkista lain');
  await page.locator('#betaWorkHoursPlan').fill('200');
  await expect(page.locator('#betaWorkHoursForecast')).toContainText('Anna suunnitellut tunnit');
});
test('viikkotuntien palautus torjuu olemassa olevan ristiriidan ja säilyttää alkuperäisen',async({page})=>{
  await page.clock.install({time:day});await page.goto('/index.html');await openLaw(page);
  await page.locator('#betaWorkHoursHours').fill('44');
  await page.locator('#betaWorkHoursSave').click();
  await expect(page.locator('#betaWorkHoursStatus')).toContainText('tallennettu');
  await page.locator('#betaWorkHoursImport').setInputFiles({
    name:'workweeks.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({app:'Palkka Beta viikkotunnit',version:1,
      weeks:{'2026-11-09':52,'2026-11-02':40}}),'utf8')
  });
  await expect(page.locator('#betaWorkHoursStatus')).toContainText('Korjaa ristiriita');
  const weeks=await page.evaluate(async()=>(await import('/storage.js')).getSetting('beta:worktime:weeks:v1'));
  expect(weeks).toEqual({'2026-11-09':44});
});
test('toimii pienillä mobiilileveyksillä ja 200 prosentin tekstikoolla',async({page})=>{
  await page.clock.install({time:day});
  for(const width of [320,360,412]){
    await page.setViewportSize({width,height:820});
    await page.goto('/index.html');await openLaw(page);
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    const size=await page.evaluate(()=>({
      doc:document.documentElement.scrollWidth,
      viewport:innerWidth,
      panel:document.getElementById('betaWorkHoursJournal').getBoundingClientRect().right
    }));
    expect(size.doc,JSON.stringify(size)).toBeLessThanOrEqual(size.viewport+1);
    expect(size.panel,JSON.stringify(size)).toBeLessThanOrEqual(size.viewport+1);
  }
});
