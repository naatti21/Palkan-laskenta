import {test,expect} from '@playwright/test';

// Synthetic inputs only. The chart must not mutate the planner or stored salaries.
test('2026 progress chart follows annual income and overtime without extra fields',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  const chart=frame.locator('#betaProgressChart');
  await expect(frame.locator('#betaProgressTitle')).toContainText('2026');
  await frame.locator('#planYear').fill('2026');
  await frame.locator('#baseGross').fill('52000');
  await expect(chart.locator('svg')).toHaveCount(1);
  await expect(frame.locator('#betaProgressSummary')).toContainText('30,1 %');
  await expect(frame.locator('#betaProgressSummary')).toContainText('Laskurin A-vaihtoehdossa');
  await expect(frame.locator('#betaABGross')).toHaveText('52 000 €');
  await frame.locator('#weekendGross').fill('1000');
  await frame.locator('#weekends').fill('3');
  await expect(frame.locator('#betaABGross')).toHaveText('55 000 €');
  await expect(frame.locator('#betaProgressSummary')).toContainText('31,1 %');
  await expect(frame.locator('#betaProgressSummary')).toContainText('Ilman valittuja työviikonloppuja: 52 000 €');
  await expect(chart.locator('svg circle')).toHaveCount(2);
  // The A/B difference is still produced by the established planner.
  await expect(frame.locator('#betaABYearA')).toHaveText((await frame.locator('#netA').textContent()).trim());
});

test('The year warning and out-of-range handling are explicit',async({page})=>{
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await frame.locator('#baseGross').fill('52000');
  await expect(frame.locator('#betaProgressSummary')).toContainText('Suunnitteluvuosi 2027');
  await expect(frame.locator('#betaProgressSummary')).toContainText('vuoden 2026 tasoa');
  await frame.locator('#baseGross').fill('180000');
  await expect(frame.locator('#betaProgressChart svg')).toHaveCount(0);
  await expect(frame.locator('#betaProgressSummary')).toContainText('alueen ulkopuolella');
  await frame.locator('#baseGross').fill('52000');
  await expect(frame.locator('#betaProgressChart svg')).toHaveCount(1);
});

test('Tax progression visualization fits narrow phone widths',async({page})=>{
  for(const width of [320,360,412]){
    await page.setViewportSize({width,height:800});
    await page.goto('/index.html');
    await page.getByRole('button',{name:'Laskuri'}).click();
    const frame=page.frameLocator('#plannerFrame');
    await frame.locator('#baseGross').fill('52000');
    await expect(frame.locator('#betaProgressChart svg')).toHaveCount(1);
    const size=await frame.locator('#betaAnnualABSummary').evaluate(el=>({
      scroll:document.documentElement.scrollWidth,viewport:innerWidth,
      chart:document.getElementById('betaProgressChart').scrollWidth,
      client:document.getElementById('betaProgressChart').clientWidth,
      card:el.scrollWidth,cardClient:el.clientWidth
    }));
    expect(size.scroll,JSON.stringify(size)).toBeLessThanOrEqual(size.viewport+1);
    expect(size.chart).toBeLessThanOrEqual(size.client+1);
    expect(size.card).toBeLessThanOrEqual(size.cardClient+1);
  }
});
