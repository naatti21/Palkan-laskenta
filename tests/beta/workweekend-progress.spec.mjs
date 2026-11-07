import {test,expect} from '@playwright/test';

test('Analysis shows user-confirmed worked weekends, never guesses from overtime pay lines',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Analyysi'}).click();
  await expect(page.locator('#betaWeekendTracker')).toBeVisible();
  await expect(page.locator('#betaWeekendDone')).toHaveText('–');
  await expect(page.locator('#betaWeekendGoal')).toHaveText('–');
  await expect(page.locator('#betaWeekendTrackerStatus')).toContainText('Palkkalaskelmasta ei voi varmistaa');
  await page.locator('#betaWeekendAdd').click();
  await expect(page.locator('#betaWeekendDone')).toHaveText('1');
  await page.locator('#betaWeekendTracker summary').click();
  await page.locator('#betaWeekendDoneInput').fill('4');
  await page.locator('#betaWeekendDoneInput').blur();
  await expect(page.locator('#betaWeekendDone')).toHaveText('4');
  await page.locator('#betaWeekendGoalInput').fill('12');
  await page.locator('#betaWeekendGoalInput').blur();
  await expect(page.locator('#betaWeekendGoal')).toHaveText('5');
  await expect(page.locator('#betaWeekendTrackerStatus')).toContainText('jäljellä tavoitteeseen 8');
  await expect.poll(()=>page.evaluate(async()=>{
    const {getSetting}=await import('/storage.js');
    return getSetting('beta:workweekends:v1:2026');
  })).toEqual({done:4,goal:12});
  await page.reload();
  await page.getByRole('button',{name:'Analyysi'}).click();
  await expect(page.locator('#betaWeekendDone')).toHaveText('4');
  await expect(page.locator('#betaWeekendGoal')).toHaveText('5');
});

test('C target saves only for its planner work year, without rewriting actual count',async({page})=>{
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const p=page.frameLocator('#plannerFrame');
  await p.locator('#planYear').fill('2026');
  await p.locator('#baseGross').fill('35000');
  await p.locator('#weekendGross').fill('1000');
  await p.locator('#limitA').fill('77000');
  await p.locator('#limitB').fill('100000');
  await expect(p.locator('#betaCCount')).toHaveText('5 viikonloppua');
  await p.locator('#betaCUseGoal').click();
  await expect(p.locator('#betaCStatus')).toContainText('Tavoite 5 viikonloppua tallennettu');
  await page.getByRole('button',{name:'Analyysi'}).click();
  await expect(page.locator('#betaWeekendGoal')).toHaveText('5');
  await expect(page.locator('#betaWeekendDone')).toHaveText('–');
  await page.locator('#betaWeekendAdd').click();
  await expect(page.locator('#betaWeekendDone')).toHaveText('1');
  await page.getByRole('button',{name:'Laskuri'}).click();
  await p.locator('#planYear').fill('2027');
  await expect(p.locator('#betaCUseGoal')).toBeDisabled();
  await expect.poll(()=>page.evaluate(async()=>{
    const {getSetting}=await import('/storage.js');
    return getSetting('beta:workweekends:v1:2027');
  })).toBeNull();
  await page.getByRole('button',{name:'Analyysi'}).click();
  await expect(page.locator('#betaWeekendDone')).toHaveText('1');
  await expect(page.locator('#betaWeekendGoal')).toHaveText('5');
});
