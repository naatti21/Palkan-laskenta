import {test,expect} from '@playwright/test';

// Isolated Beta UI tests. Use only invented amounts, never personal payroll data.
test('Five compact tabs remain navigable at 320 / 360 / 412 px',async({page})=>{
  for(const width of [320,360,412]){
    await page.setViewportSize({width,height:800});
    await page.goto('/index.html');
    const names=await page.locator('.tabs [data-view-target]').allTextContents();
    expect(names.map(n=>n.trim())).toEqual(['Seuranta','Analyysi','Historia','Laskuri','Data']);
    const layout=await page.evaluate(()=>{
      const nav=document.querySelector('.tabs');
      const tabs=[...nav.querySelectorAll('button')];
      const navBounds=nav.getBoundingClientRect();
      return {
        bg:getComputedStyle(document.body).backgroundColor,
        columns:getComputedStyle(nav).gridTemplateColumns.split(' ').length,
        allInside:tabs.every(b=>b.getBoundingClientRect().right<=navBounds.right+1
          && b.getBoundingClientRect().left>=navBounds.left-1),
        documentOverflow:document.documentElement.scrollWidth>innerWidth+1
      };
    });
    expect(layout.bg).toBe('rgb(8, 10, 13)');
    expect(layout.columns).toBe(5);
    expect(layout.allInside).toBe(true);
    expect(layout.documentOverflow).toBe(false);
    await page.getByRole('button',{name:'Laskuri'}).click();
    await expect(page.getByRole('heading',{name:'Vuosisuunnittelu'})).toBeVisible();
    await expect(page.locator('#plannerFrame')).toBeVisible();
    await expect(page.locator('[data-view="analysis"]')).toBeHidden();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
    await expect(page.locator('#pdfInput')).toBeDisabled();
  }
});

test('Planner inputs and locally computed net survive tab switches without remounting',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await frame.locator('#baseGross').fill('52000');
  await frame.locator('#planYear').fill('2026');
  await expect(frame.locator('#netref26Monthly')).toHaveText('3 030 €');
  const before=await page.locator('#plannerFrame').evaluate(el=>el.contentWindow);
  await page.getByRole('button',{name:'Analyysi'}).click();
  await expect(page.locator('#plannerFrame')).toBeHidden();
  await expect(page.getByRole('heading',{name:'Ansiot ja työaika'})).toBeVisible();
  await page.getByRole('button',{name:'Historia'}).click();
  await page.getByRole('button',{name:'Laskuri'}).click();
  await expect(frame.locator('#baseGross')).toHaveValue('52000');
  await expect(frame.locator('#netref26Monthly')).toHaveText('3 030 €');
  const after=await page.locator('#plannerFrame').evaluate(el=>el.contentWindow);
  expect(after).toBeTruthy();
  expect(before).toBeTruthy();
  await expect(page.locator('#plannerSyncStatus')).toContainText('Historiaa ei vielä ole');
});

test('Annual calculator is offline-cached under the same Beta-only origin',async({page})=>{
  await page.goto('/index.html');
  await expect.poll(async()=>page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    const name=(await caches.keys()).find(k=>k.startsWith('palkka-beta-v'));
    if(!name)return [];
    return (await (await caches.open(name)).keys()).map(r=>new URL(r.url).pathname);
  })).toEqual(expect.arrayContaining([
    '/experiments/year-planner/index.html',
    '/experiments/year-planner/net-reference-2026.mjs'
  ]));
});
