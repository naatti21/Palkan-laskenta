import { test, expect } from '@playwright/test';

// UI-only synthetic values, no real salary documents or personal profiles.
test('Beta planner converts gross annual baseline to month and fortnight net using 2026 reference',async({page})=>{
  await page.setViewportSize({width:360,height:780});
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await expect(frame.locator('#betaNetReference2026')).toBeVisible();
  await expect(frame.locator('#netref26Monthly')).toHaveText('–');
  await frame.locator('#baseGross').fill('52000');
  await frame.locator('#planYear').fill('2026');
  await expect(frame.locator('#netref26GrossAnnual')).toHaveText('52 000 €');
  await expect(frame.locator('#netref26NetAnnual')).toHaveText('36 363 €');
  await expect(frame.locator('#netref26Monthly')).toHaveText('3 030 €');
  await expect(frame.locator('#netref26Fortnight')).toHaveText('1 399 €');
  await expect(frame.locator('#netref26Summary')).not.toContainText('36 363 €');
  await expect(frame.locator('#netref26Summary')).toContainText('30,1 %');
  await expect(frame.locator('#netref26Summary')).toContainText('eivät ole mukana');
  await expect(frame.locator('#netref26YearWarning')).toContainText('2026');
  await expect(frame.locator('#netref26YearWarning')).not.toContainText('EI ennusta');
  await expect(page.locator('#pdfInput')).toBeDisabled();
  const over = await frame.locator('#betaNetReference2026').evaluate(el=>el.scrollWidth>el.clientWidth+1);
  expect(over).toBe(false);
});

test('Overtime extra and 2027 warning remain separate from unverified tax card scenarios',async({page})=>{
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await frame.locator('#baseGross').fill('52000');
  await expect(frame.locator('#netref26YearWarning')).toContainText('EI ennusta vuoden 2027 verotusta');
  await expect(frame.locator('#netref26Monthly')).toHaveText('3 030 €');
  await frame.locator('#weekendGross').fill('1000');
  await frame.locator('#weekends').fill('3');
  await expect(frame.locator('#netref26Overtime')).toBeVisible();
  await expect(frame.locator('#netref26OvertimeTitle')).toContainText('3 kpl');
  await expect(frame.locator('#netref26OvertimeText')).toContainText('Lisäbrutto 3 000 €');
  await expect(frame.locator('#rateA')).toHaveValue('30');
  await expect(frame.locator('#rateB')).toHaveValue('33');
  await expect(frame.locator('#rateConfirmedA')).not.toBeChecked();
  await frame.locator('#holiday').fill('3400');
  await expect(frame.locator('#netref26Monthly')).toHaveText('3 030 €');
  await frame.locator('#netref26IncludeExtra').check();
  await expect(frame.locator('#netref26Monthly')).not.toHaveText('3 030 €');
  await expect(frame.locator('#netref26Summary')).toContainText('Valitut lisät mukana');
});

test('No invented estimates for out-of-range income or missing overtime gross',async({page})=>{
  await page.goto('/index.html');
  await page.getByRole('button',{name:'Laskuri'}).click();
  const frame=page.frameLocator('#plannerFrame');
  await frame.locator('#baseGross').fill('180000');
  await expect(frame.locator('#netref26Monthly')).toHaveText('–');
  await expect(frame.locator('#netref26GrossAnnual')).toHaveText('–');
  await expect(frame.locator('#netref26NetAnnual')).toHaveText('–');
  await expect(frame.locator('#netref26Summary')).toContainText('alueen ulkopuolella');
  await frame.locator('#baseGross').fill('52000');
  await frame.locator('#weekends').fill('4');
  await expect(frame.locator('#netref26Overtime')).toBeHidden();
});
