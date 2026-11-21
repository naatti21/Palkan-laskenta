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
  await frame.locator('#betaWeekendsA').fill('3');
  await frame.locator('#betaWeekendsB').fill('3');
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
    await expect(frame.locator('#plannerAdvanced')).toBeVisible();
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


test('chart legend distinguishes lines from circles and the C marker matches yellow',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await frame.locator('#planYear').fill('2026');
  await frame.locator('#baseGross').fill('35000');
  await frame.locator('#weekendGross').fill('1000');
  await frame.locator('#betaCTarget').fill('3000');
  await expect(frame.locator('#betaCCount')).toContainText('17 viikonloppua');
  const chart=frame.locator('#betaProgressChart');
  await expect(chart.locator('circle[data-series="C"]')).toHaveAttribute('fill','#f4d98f');
  const legend=await frame.locator('.beta-progress-legend').evaluate(el=>{
    const kind=selector=>{
      const node=el.querySelector(selector),style=getComputedStyle(node,'::before');
      return {shape:style.borderRadius,border:style.borderTopStyle,color:style.backgroundColor};
    };
    return {groups:[...el.querySelectorAll('.beta-progress-legend-group > strong')].map(e=>e.textContent),
      total:el.querySelectorAll('span').length,
      ref:kind('.p-ref'),marg:kind('.p-marg'),a:kind('.p-a'),b:kind('.p-b'),c:kind('.p-c')};
  });
  expect(legend.groups).toEqual(['Käyrät','Vertailupisteet']);
  expect(legend.total).toBe(5);
  expect(legend.ref.border).toBe('solid');
  expect(legend.marg.border).toBe('dashed');
  for(const point of [legend.a,legend.b,legend.c])expect(point.shape).toBe('50%');
  expect(legend.c.color).toBe('rgb(244, 217, 143)');
});

test('beta calculator has no hidden disclosure menus, preserving all core controls',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await expect(frame.locator('.shell details')).toHaveCount(0);
  await frame.locator('#baseGross').fill('35000');
  await frame.locator('#weekendGross').fill('1000');
  for(const id of ['#regularHours','#historyStatus','#weekendPayDetails',
    '#weekendMethod','#rulesConfirmed','#inverseNetGoal','#rateUncertainty',
    '#allComparisons','#betaProgressChart','#betaCGoalSection']){
    await expect(frame.locator(id)).toBeVisible();
  }
  await expect(frame.locator('#allSamples tr')).toHaveCount(53);
  const toggle=frame.locator('#allComparisonsToggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(frame.locator('#allComparisonsTable')).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(frame.locator('#allComparisonsTable')).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(frame.locator('#allComparisonsTable')).toBeHidden();
  const overflow=await frame.locator('.shell').evaluate(el=>({
    viewport:innerWidth,actual:document.documentElement.scrollWidth
  }));
  expect(overflow.actual).toBeLessThanOrEqual(overflow.viewport+1);
});
