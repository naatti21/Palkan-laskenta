import {test,expect} from '@playwright/test';

const readEuros=text=>Number(text.replace(/[\s\u00a0\u202f€]/g,'').replace('−','-').replace(',','.'));
const shown=n=>Math.round(n).toLocaleString('fi-FI')+' €';

// The real A/B model must remain the source of truth; UI cards only reformat its results.
test('Final A/B comparison presents annual gross, actual model net and period averages',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await expect(frame.locator('#betaAnnualABSummary')).toBeVisible();
  await frame.locator('#baseGross').fill('52000');
  await frame.locator('#planYear').fill('2027');
  await frame.locator('#weekendGross').fill('1000');
  await frame.locator('#weekends').fill('3');
  await expect(frame.locator('#grossResult')).toHaveText('55 000 €');
  await expect(frame.locator('#betaABGross')).toHaveText('55 000 €');
  await expect(frame.locator('#betaABCount')).toContainText('2027 · 3 työviikonloppua');
  const annualA=await frame.locator('#netA').textContent();
  const annualB=await frame.locator('#netB').textContent();
  await expect(frame.locator('#betaABYearA')).toHaveText(annualA.trim());
  await expect(frame.locator('#betaABYearB')).toHaveText(annualB.trim());
  await expect(frame.locator('#betaABMonthA')).toHaveText(shown(readEuros(annualA)/12));
  await expect(frame.locator('#betaABMonthB')).toHaveText(shown(readEuros(annualB)/12));
  await expect(frame.locator('#betaABPeriodA')).toHaveText(shown(readEuros(annualA)/26));
  await expect(frame.locator('#betaABPeriodB')).toHaveText(shown(readEuros(annualB)/26));
  await expect(frame.locator('.beta-ab-caveat').first()).toContainText('ei lopullisesta verosta');
  await expect(frame.locator('.beta-ab-caveat').last()).toContainText('2026');

  // Change the model — the presentation must follow, not stale or recompute its own A/B tax.
  await frame.locator('#rateB').fill('41');
  const changedB=await frame.locator('#netB').textContent();
  await expect(frame.locator('#betaABYearB')).toHaveText(changedB.trim());
  await expect(frame.locator('#betaABYearA')).toHaveText((await frame.locator('#netA').textContent()).trim());
  await expect(frame.locator('#betaABDifference')).toContainText('A:lla jää');
  await expect(page.locator('#pdfInput')).toBeDisabled();
});

test('Gross/net front cards and final A/B summary fit phone widths without horizontal overflow',async({page})=>{
  for(const width of [320,360,412]){
    await page.setViewportSize({width,height:800});
    await page.goto('/index.html');
    await page.getByRole('button',{name:'Laskuri'}).click();
    const frame=page.frameLocator('#plannerFrame');
    await frame.locator('#baseGross').fill('52000');
    await expect(frame.locator('#netref26GrossAnnual')).toHaveText('52 000 €');
    await expect(frame.locator('#netref26NetAnnual')).toHaveText('36 363 €');
    const result=await frame.locator('#betaAnnualABSummary').evaluate(el=>({
      mainOverflow:document.documentElement.scrollWidth>innerWidth+1,
      abOverflow:el.scrollWidth>el.clientWidth+1,
      frontOverflow:document.querySelector('#betaNetReference2026').scrollWidth>
        document.querySelector('#betaNetReference2026').clientWidth+1,
      iframeWidth:innerWidth,
      actualWidth:document.documentElement.scrollWidth,
      offenders:[...document.querySelectorAll('body *')].filter(el=>{
        const r=el.getBoundingClientRect();
        return r.width>0 && r.right>innerWidth+2 && getComputedStyle(el).position!=='fixed';
      }).slice(0,12).map(el=>({tag:el.tagName,id:el.id,classes:String(el.className).slice(0,55),
        right:Math.round(el.getBoundingClientRect().right),scroll:el.scrollWidth,client:el.clientWidth}))
    }));
    expect(result.mainOverflow,JSON.stringify({width,result})).toBe(false);
    expect(result.abOverflow).toBe(false);
    expect(result.frontOverflow).toBe(false);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  }
});

test('Final A/B summary drops stale numbers if base model validation fails',async({page})=>{
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await frame.locator('#baseGross').fill('52000');
  await expect(frame.locator('#betaABYearA')).not.toHaveText('–');
  await frame.locator('#rateA').fill('105');
  await expect(frame.locator('#validation')).toHaveClass(/error/);
  await expect(frame.locator('#betaABYearA')).toHaveText('–');
  await expect(frame.locator('#betaABYearB')).toHaveText('–');
  await expect(frame.locator('#betaABGross')).toHaveText('–');
  await frame.locator('#rateA').fill('30');
  await expect(frame.locator('#betaABYearA')).not.toHaveText('–');
});

test('Beta service worker caches both local presentation modules',async({page})=>{
  await page.goto('/index.html');
  await expect.poll(async()=>page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    const name=(await caches.keys()).find(k=>k.startsWith('palkka-beta-v'));
    if(!name)return [];
    return (await (await caches.open(name)).keys()).map(r=>new URL(r.url).pathname);
  })).toEqual(expect.arrayContaining([
    '/experiments/year-planner/net-reference-2026.mjs',
    '/experiments/year-planner/ab-summary-v6.mjs'
  ]));
});
