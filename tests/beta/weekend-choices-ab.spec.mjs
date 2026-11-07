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


test('C is a real optimizer alongside A/B: no arbitrary optimum, then minimum workload for a net goal',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const p=frameOf(page);
  const card=p.locator('.beta-ab-c');
  await expect(card).toBeVisible();
  const sameGroup=await card.evaluate(el=>({
    insideAB:document.getElementById('betaAnnualABSummary').contains(el),
    sameCards:el.parentElement.classList.contains('beta-ab-cards'),
    afterB:!!(document.querySelector('.beta-ab-b').compareDocumentPosition(el)&
      Node.DOCUMENT_POSITION_FOLLOWING)
  }));
  expect(sameGroup).toEqual({insideAB:true,sameCards:true,afterB:true});
  await p.locator('#planYear').fill('2026');
  await p.locator('#baseGross').fill('35000');
  await p.locator('#weekendGross').fill('1000');
  await expect(p.locator('#betaCCount')).toHaveText('0–52 viikonloppua');
  await expect(p.locator('#betaCNet')).toContainText(' – ');
  await expect(p.locator('#betaCReason')).toContainText('ei ole yhtä laskennallista optimia');
  await expect(p.locator('#betaCUseGoal')).toBeDisabled();
  await expect(p.locator('#samples').locator('xpath=..').locator('thead')).toContainText('C: netto');
  await expect(p.locator('#allSamples .beta-c-net-cell')).toHaveCount(53);
  await expect(p.locator('#netChart svg polyline.line')).toHaveCount(3);
  await expect(p.locator('#betaProgressChart svg [data-series="C"]')).toHaveCount(0);

  await p.locator('#betaCTarget').fill('3000');
  await expect(p.locator('#betaCCount')).toHaveText('17 viikonloppua');
  await expect(p.locator('#betaCGross')).toHaveText('52 000 €');
  await expect(p.locator('#betaCNet')).toHaveText('36 363 €');
  await expect(p.locator('#betaCMonth')).toHaveText('3 030 €');
  await expect(p.locator('#betaCPeriod')).toHaveText('1 399 €');
  await expect(p.locator('#betaCReason')).toContainText('Pienin työmäärä');
  await expect(p.locator('#betaCUseGoal')).toBeEnabled();
  await expect(p.locator('#samples [data-c-optimized="yes"] .point-count')).toHaveText('17');
  await expect(p.locator('#netChart svg [data-c-selected="yes"]')).toHaveCount(1);
  await expect(p.locator('#betaProgressChart svg [data-series="C"]')).toHaveCount(1);
  await p.locator('#betaWeekendsA').fill('3');
  await p.locator('#betaWeekendsB').fill('9');
  await expect(p.locator('#betaCCount')).toHaveText('17 viikonloppua');
  await expect(p.locator('#betaWeekendsA')).toHaveValue('3');
  await expect(p.locator('#betaWeekendsB')).toHaveValue('9');

  // A high minimum gain/hour makes the income target infeasible, not an
  // artificially "optimal" shorter workload.
  await p.locator('#betaCMinPerHour').fill('35');
  await expect(p.locator('#betaCCount')).toHaveText('Tavoite ei toteudu ehdoilla');
  await expect(p.locator('#betaCReason')).toContainText('enintään 5 työviikonloppua');
  await expect(p.locator('#betaCUseGoal')).toBeDisabled();
  await p.locator('#betaCMinPerHour').fill('');
  await expect(p.locator('#betaCCount')).toHaveText('17 viikonloppua');
  await p.locator('#betaCTarget').fill('');
  await expect(p.locator('#betaCCount')).toHaveText('0–52 viikonloppua');
  await expect(p.locator('#betaCUseGoal')).toBeDisabled();

  await p.locator('#planYear').fill('2027');
  await p.locator('#betaCTarget').fill('3000');
  await expect(p.locator('#betaCCount')).toHaveText('17 viikonloppua');
  await expect(p.locator('#betaCCompare')).toContainText('käyttää vuoden 2026 yleisviitettä');
  await expect(p.locator('#betaCUseGoal')).toBeDisabled();
});

test('C reference curve does not hide unrepresented income ranges or compare as a tax-card rate',async({page})=>{
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const p=frameOf(page);
  await p.locator('#planYear').fill('2026');
  await p.locator('#baseGross').fill('135000');
  await p.locator('#weekendGross').fill('1000');
  await expect(p.locator('#allSamples .beta-c-net-cell')).toHaveCount(53);
  await expect(p.locator('#allSamples tr').last().locator('.beta-c-net-cell')).toHaveText('–');
  await expect(p.locator('#betaCCompare')).toContainText('A/B kuvaavat verokortin ennakonpidätyksen jälkeistä rahaa');
  await p.locator('#baseGross').fill('180000');
  await expect(p.locator('#betaCCount')).toHaveText('–');
  await expect(p.locator('#betaCReason')).toContainText('ei kata näitä lähtötuloja');
});
