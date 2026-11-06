import {test,expect} from '@playwright/test';

const frameOf=page=>page.frameLocator('#plannerFrame');

// Both choices derive from the SAME verified planner model's complete 0–52 series.
test('A and B can model different weekend counts without changing equal-workload comparison',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=frameOf(page);
  await frame.locator('#planYear').fill('2026');
  await frame.locator('#baseGross').fill('52000');
  await frame.locator('#weekendGross').fill('1000');
  await frame.locator('#weekends').fill('3');
  await expect(frame.locator('#betaWeekendsA')).toHaveValue('3');
  await expect(frame.locator('#betaWeekendsB')).toHaveValue('3');
  await expect(frame.locator('#grossResult')).toHaveText('55 000 €');
  await frame.locator('#betaWeekendsA').fill('2');
  await frame.locator('#betaWeekendsB').fill('10');
  await expect(frame.locator('#betaABGross')).toHaveText('Eri vuositulot');
  await expect(frame.locator('#betaABGrossA')).toHaveText('54 000 €');
  await expect(frame.locator('#betaABGrossB')).toHaveText('62 000 €');
  await expect(frame.locator('#betaABYearA')).toHaveText('32 400 €');
  await expect(frame.locator('#betaABYearB')).toHaveText('35 340 €');
  await expect(frame.locator('#betaABCount')).toContainText('A: 2 työviikonloppua · B: 10');
  await expect(frame.locator('#betaABDifference')).toContainText('Ero sisältää sekä työn määrän');
  await expect(frame.locator('#betaABBreakdown')).toContainText('työmäärän vaikutus');
  await expect(frame.locator('#betaABBreakdown')).toContainText('korttien pidätyseron vaikutus');
  await expect(frame.locator('#betaProgressSummary')).toContainText('A: 2 työviikonloppua');
  await expect(frame.locator('#betaProgressSummary')).toContainText('B: 10 työviikonloppua');
  await expect(frame.locator('#betaProgressChart svg circle')).toHaveCount(2);
  // Old calculator remains apples-to-apples (three weekends for both), avoiding false card comparisons.
  await expect(frame.locator('#grossResult')).toHaveText('55 000 €');
  await expect(frame.locator('#netA')).toHaveText('33 000 €');
  await expect(frame.locator('#netB')).toHaveText('31 350 €');
  await frame.locator('#weekends').fill('4');
  await expect(frame.locator('#betaWeekendsA')).toHaveValue('2');
  await expect(frame.locator('#betaWeekendsB')).toHaveValue('10');
  await frame.locator('#betaWeekendsReset').click();
  await expect(frame.locator('#betaWeekendsA')).toHaveValue('4');
  await expect(frame.locator('#betaWeekendsB')).toHaveValue('4');
  await expect(frame.locator('#betaABGross')).toHaveText('56 000 €');
  await expect(frame.locator('#betaABYearA')).toHaveText((await frame.locator('#netA').textContent()).trim());
  await expect(frame.locator('#betaABYearB')).toHaveText((await frame.locator('#netB').textContent()).trim());
});

test('Zero weekends and invalid count are handled without invented extra income',async({page})=>{
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=frameOf(page);
  await frame.locator('#baseGross').fill('52000');
  await frame.locator('#weekendGross').fill('1000');
  await frame.locator('#betaWeekendsA').fill('0');
  await frame.locator('#betaWeekendsB').fill('8');
  await expect(frame.locator('#betaABGrossA')).toHaveText('52 000 €');
  await expect(frame.locator('#betaABGrossB')).toHaveText('60 000 €');
  await frame.locator('#betaWeekendsB').fill('53');
  await expect(frame.locator('#betaABYearB')).toHaveText('–');
  await expect(frame.locator('#betaProgressChart svg')).toHaveCount(0);
  await expect(frame.locator('#betaABDifference')).toContainText('kokonaisluku 0–52');
  await frame.locator('#betaWeekendsB').fill('8');
  await expect(frame.locator('#betaABYearB')).not.toHaveText('–');
  await frame.locator('#weekendGross').fill('0');
  await expect(frame.locator('#betaABYearB')).toHaveText('–');
  await expect(frame.locator('#betaABDifference')).toContainText('bruttokorvaus');
});

test('Independent weekend controls stay within narrow mobile card',async({page})=>{
  for(const width of [320,360,412]){
    await page.setViewportSize({width,height:800});
    await page.goto('/index.html');
    await page.getByRole('button',{name:'Laskuri'}).click();
    const frame=frameOf(page);
    await frame.locator('#baseGross').fill('52000');
    await frame.locator('#weekendGross').fill('1000');
    await frame.locator('#betaWeekendsA').fill('3');
    await frame.locator('#betaWeekendsB').fill('12');
    await expect(frame.locator('#betaProgressChart svg')).toHaveCount(1);
    const geometry=await frame.locator('#betaAnnualABSummary').evaluate(el=>({
      viewport:innerWidth,body:document.documentElement.scrollWidth,card:el.clientWidth,scroll:el.scrollWidth
    }));
    expect(geometry.scroll,JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.card+1);
    expect(geometry.body,JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport+1);
  }
});
