import {test,expect} from '@playwright/test';

const frameOf=page=>page.frameLocator('#plannerFrame');

// Both choices use the SAME verified planner model, not a second tax calculator.
test('A and B choose independent weekend counts in the first cards and share tested maths',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=frameOf(page);
  await expect(frame.locator('#betaAnnualABSummary')).toBeVisible();
  await expect(frame.locator('.beta-ab-a #betaWeekendsA')).toBeVisible();
  await expect(frame.locator('.beta-ab-b #betaWeekendsB')).toBeVisible();
  await expect(frame.locator('#betaWeekendsReset')).toHaveCount(0);
  await expect(frame.locator('#weekends')).toBeHidden();
  const topOrder=await frame.locator('#betaAnnualABSummary').evaluate(el=>
    !!(el.compareDocumentPosition(document.getElementById('weekends-title'))&
      Node.DOCUMENT_POSITION_FOLLOWING));
  expect(topOrder).toBe(true);

  await frame.locator('#planYear').fill('2026');
  await frame.locator('#baseGross').fill('52000');
  await frame.locator('#weekendGross').fill('1000');
  await frame.locator('#betaWeekendsA').fill('2');
  await frame.locator('#betaWeekendsB').fill('10');
  await expect(frame.locator('#weekends')).toHaveValue('2'); // internal A reference
  await expect(frame.locator('#grossResult')).toHaveText('54 000 €');
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

  await frame.locator('#betaWeekendsA').fill('4');
  await expect(frame.locator('#weekends')).toHaveValue('4');
  await expect(frame.locator('#betaWeekendsB')).toHaveValue('10');
  await expect(frame.locator('#grossResult')).toHaveText('56 000 €');
  await expect(frame.locator('#betaABGrossA')).toHaveText('56 000 €');
  await expect(frame.locator('#betaABGrossB')).toHaveText('62 000 €');
  await frame.locator('#betaWeekendsB').fill('4');
  await expect(frame.locator('#betaABYearA')).toHaveText((await frame.locator('#netA').textContent()).trim());
  await expect(frame.locator('#betaABYearB')).toHaveText((await frame.locator('#netB').textContent()).trim());
});

test('Zero weekends and invalid count do not invent additional wages',async({page})=>{
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

test('A/B cards stay within 320 / 360 / 412 px mobile viewports',async({page})=>{
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
