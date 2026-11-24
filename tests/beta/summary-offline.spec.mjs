import {test,expect} from '@playwright/test';

for(const width of [320,360,412])test(`summary adapter loads offline and keeps independent choices at ${width}px`,async({page,context})=>{
  await page.setViewportSize({width,height:850});
  await page.goto('/index.html');
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await expect(frame.locator('.beta-ab-a #betaWeekendsA')).toBeVisible();
  await frame.locator('#baseGross').fill('52000');
  await frame.locator('#weekendGross').fill('1000');
  await frame.locator('#betaWeekendsA').fill('2');
  await frame.locator('#betaWeekendsB').fill('10');
  await expect(frame.locator('#betaABYearA')).toHaveText('32 400 €');
  await expect(frame.locator('#betaABYearB')).toHaveText('35 340 €');
  await frame.locator('#betaWeekendsB').fill('53');
  await expect(frame.locator('#betaABYearB')).toHaveText('–');
  await frame.locator('#betaWeekendsB').fill('10');
  await expect(frame.locator('#betaABYearB')).toHaveText('35 340 €');
  await expect(frame.locator('#betaWeekendsA')).toHaveValue('2');
  const geometry=await frame.locator('#betaAnnualABSummary').evaluate(el=>({
    width:innerWidth,scroll:document.documentElement.scrollWidth,card:el.clientWidth,content:el.scrollWidth
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width+1);
  expect(geometry.content).toBeLessThanOrEqual(geometry.card+1);
  expect(await page.evaluate(async()=> (await (await import('/storage.js')).getAllRecords()).length)).toBe(0);
});
