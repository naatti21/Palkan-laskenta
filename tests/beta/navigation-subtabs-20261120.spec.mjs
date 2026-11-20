import { test, expect } from '@playwright/test';

// Navigation checks use empty local storage; no personal payslips are imported.
test('Fixed bottom navigation fits narrow screens and switches to a fresh view', async ({page}) => {
  for (const width of [320, 360, 412]) {
    await page.setViewportSize({width, height:740});
    await page.goto('/index.html');
    const layout = await page.locator('.tabs').evaluate(nav => {
      const r=nav.getBoundingClientRect();
      const style=getComputedStyle(nav);
      return {position:style.position, bottom:window.innerHeight-r.bottom,
        left:r.left,right:r.right,width:innerWidth, columns:style.gridTemplateColumns.split(' ').length};
    });
    expect(layout.position).toBe('fixed');
    expect(layout.bottom).toBeGreaterThanOrEqual(0);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.columns).toBe(5);
    await page.getByRole('button', {name:'Laskuri'}).click();
    await page.evaluate(() => window.scrollTo(0, 850));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    await page.getByRole('button', {name:'Historia'}).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  }
});

test('Analysis presents three accessible subtopics with weekend tracking immediately available', async ({page}) => {
  await page.goto('/index.html');
  await page.getByRole('button', {name:'Analyysi'}).click();
  await expect(page.locator('.analysis-collection')).toHaveCount(0);
  const tabs=page.locator('#betaAnalysisNav [role="tab"]');
  await expect(tabs).toHaveCount(3);
  await expect(page.getByRole('tab',{name:'Ylityöt'})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#betaWeekendTracker')).toBeVisible();
  await page.getByRole('tab', {name:'Palkat'}).click();
  await expect(page.locator('#monthlyChart')).toBeVisible();
  await expect(page.locator('#betaWeekendTracker')).toBeHidden();
  await page.getByRole('tab', {name:'Tarkemmat'}).click();
  await expect(page.locator('#budgetSummary')).toBeVisible();
  await page.getByRole('tab', {name:'Ylityöt'}).click();
  await expect(page.locator('#betaWeekendTracker')).toBeVisible();
});

test('Planner shortcut jumps between model inputs and results on the outer page', async ({page}) => {
  await page.setViewportSize({width:360,height:750});
  await page.goto('/index.html');
  await page.getByRole('button', {name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await expect(frame.locator('#results-title')).toBeVisible();
  await expect(page.locator('#betaPlannerJump button')).toHaveCount(5);
  await page.locator('[data-planner-jump="results-title"]').click();
  const position = () => page.evaluate(() => {
    const iframe=document.getElementById('plannerFrame');
    return iframe.getBoundingClientRect().top +
      iframe.contentDocument.getElementById('results-title').getBoundingClientRect().top;
  });
  await expect.poll(position).toBeGreaterThan(0);
  await expect.poll(position).toBeLessThan(175);
  await page.locator('[data-planner-jump="weekends-title"]').click();
  await expect.poll(() => page.evaluate(() => {
    const iframe=document.getElementById('plannerFrame');
    return iframe.getBoundingClientRect().top +
      iframe.contentDocument.getElementById('weekends-title').getBoundingClientRect().top;
  })).toBeLessThan(175);
  await expect(frame.locator('#weekends')).toHaveValue('0');
});
