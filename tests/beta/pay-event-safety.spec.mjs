import { test, expect } from '@playwright/test';
import { makeTextPdf } from '../staging/pdf-helper.mjs';
// Deliberately synthetic documents, never uploaded to a server.
const pdf = (net='1 900,00', marker='A') => ({name:'synthetic.pdf',mimeType:'application/pdf',buffer:makeTextPdf([
  'PALKKALASKELMA','Palkkakausi 1.8.2026 - 15.8.2026','Maksupäivä 28.8.2026',
  'Maksetaan '+net,'KERTYMÄ PALKKAKAUDELTA','Ennakonpid. al. tul 3 000,00',
  'Ennakonpidätys -800,00','Maksetaan '+net,'KERTYMÄ VUODEN ALUSTA',
  'Ennakonpid. al. tul 24 000,00','Ennakonpidätys -6 400,00','Testiasiakirja '+marker])});
const state = page => page.evaluate(async()=>{
  const s=await import('/storage.js'),m=await import('/model.js'),a=await import('/analytics.js');
  const rows=await s.getAllRecords();return {rows,analysis:a.buildYearAnalysis(rows,2026),visible:m.visibleRevisions(rows)};
});
for(const width of [360,412]) {
  test(`payment decisions remain usable and durable at ${width}px`,async({page,context})=>{
    await page.setViewportSize({width,height:915});await page.goto('/index.html');
    await page.locator('#pdfInput').setInputFiles(pdf());
    await expect(page.locator('#status')).toContainText('tallennettiin automaattisesti');
    await page.locator('#pdfInput').setInputFiles(pdf());
    await expect(page.locator('#status')).toContainText('ilman tuplaa');
    expect((await state(page)).rows).toHaveLength(1);
    // Different bytes, identical extracted amounts: must ask rather than collapse or add.
    await page.locator('#pdfInput').setInputFiles(pdf('1 900,00','B'));
    await expect(page.locator('#conflictSection')).toBeVisible();
    await expect(page.locator('#keepBothConflictButton')).toContainText('huomioi laskennassa');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#keepBothConflictButton').click();
    await expect(page.locator('#resultTitle')).toContainText('Molemmat');
    expect((await state(page)).analysis.totalNet).toBe(3800);
    await page.locator('#pdfInput').setInputFiles(pdf());
    await expect(page.locator('#status')).toContainText('ilman tuplaa');
    await expect(page.locator('#conflictSection')).toBeHidden();
    expect((await state(page)).rows).toHaveLength(2);
    await page.reload();
    expect((await state(page)).analysis.totalNet).toBe(3800);
    // Export and restore twice through the same storage API used by Data import.
    await page.evaluate(async()=>{const s=await import('/storage.js'),m=await import('/model.js');
      const backup=m.makeBackup(await s.getAllRecords());await s.mergeManyRecords(m.parseBackup(backup));await s.mergeManyRecords(m.parseBackup(backup));});
    expect((await state(page)).analysis.totalNet).toBe(3800);
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await page.reload();
    await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);await page.reload();
    await expect(page.locator('#pdfInput')).toBeEnabled();
    expect((await state(page)).analysis.totalNet).toBe(3800);
    await context.setOffline(false);
  });
}
test('replacement keeps an archive; backup conflict can be resolved from History',async({page})=>{
  await page.goto('/index.html');await page.locator('#pdfInput').setInputFiles(pdf());
  await expect(page.locator('#status')).toContainText('tallennettiin automaattisesti');
  await page.locator('#pdfInput').setInputFiles(pdf('1 950,00','correction'));
  await expect(page.locator('#conflictSection')).toBeVisible();await page.locator('#replaceConflictButton').click();
  await expect(page.locator('#resultBadge')).toHaveText('Korvattu');
  let result=await state(page);expect(result.rows).toHaveLength(2);expect(result.analysis.totalNet).toBe(1950);
  await page.evaluate(async()=>{const s=await import('/storage.js');const rows=await s.getAllRecords();
    const latest=rows.find(r=>r.resolution!=='superseded');await s.mergeManyRecords([{...latest,id:'synthetic-conflict',sourceHash:null,values:{...latest.values,netPay:2000}}]);});
  await page.reload();await page.getByRole('button',{name:'Kalenteri',exact:true}).click();
  await expect(page.getByText('Korvattu versio – ei laskennassa')).toBeVisible();
  await page.getByRole('button',{name:'Ratkaise palkkatapahtuma'}).first().click();
  await expect(page.locator('#conflictSection')).toBeVisible();await page.locator('#keepBothConflictButton').click();
  expect((await state(page)).analysis.totalNet).toBe(3950);
});
test('two tabs serialize simultaneous identical PDF imports',async({page,context})=>{
  await page.goto('/index.html');const other=await context.newPage();await other.goto('/index.html');
  await Promise.all([page.locator('#pdfInput').setInputFiles(pdf()),other.locator('#pdfInput').setInputFiles(pdf())]);
  await expect.poll(async()=> (await state(page)).rows.length).toBe(1);
  await expect(page.locator('#pdfInput')).toBeEnabled();await expect(other.locator('#pdfInput')).toBeEnabled();
  expect((await state(page)).analysis.totalNet).toBe(1900);
});
test('missing payment date can be repaired from History',async({page})=>{
  await page.goto('/index.html');
  await page.evaluate(async()=>{const s=await import('/storage.js'),m=await import('/model.js');
    await s.mergeManyRecords([m.migrateLegacyRecord({recordSchemaVersion:1,id:'missing-date',values:{grossPay:3000,netPay:1900,ytdTaxableIncome:24000}})]);});
  await page.reload();await page.getByRole('button',{name:'Kalenteri',exact:true}).click();
  await page.getByRole('button',{name:'Ratkaise palkkatapahtuma'}).click();
  await expect(page.locator('#reviewSection')).toBeVisible();
  await page.locator('#reviewGrid input[data-key="payDate"]').fill('2026-08-28');
  await page.locator('#saveButton').click();
  await expect(page.locator('#status')).toContainText('Korjaus tallennettu');
  expect((await state(page)).analysis.totalNet).toBe(1900);
});
test('choosing another replacement target updates the comparison and replaces only that target',async({page})=>{
  await page.goto('/index.html');
  await page.evaluate(async()=>{const s=await import('/storage.js'),m=await import('/model.js');
    await s.mergeManyRecords([1000,1200,1400].map((net,i)=>m.migrateLegacyRecord({recordSchemaVersion:1,id:'choice-'+i,
      values:{payDate:'2026-08-28',payPeriodStart:'2026-08-01',payPeriodEnd:'2026-08-15',grossPay:3000,netPay:net,ytdTaxableIncome:24000}})));});
  await page.locator('#pdfInput').setInputFiles(pdf('1 950,00','target-test'));
  await expect(page.locator('#conflictSection')).toBeVisible();
  await page.locator('#replacementTarget').selectOption('choice-2');
  await expect(page.locator('#replacementTarget')).toHaveValue('choice-2');
  await expect(page.locator('#conflictSummary')).toContainText(/1\s*400,00.*→.*1\s*950,00/);
  await page.locator('#replaceConflictButton').click();
  await expect(page.locator('#resultBadge')).toHaveText('Korvattu');
  const result=await state(page);
  expect(result.rows.find(r=>r.id==='choice-2').resolution).toBe('superseded');
  expect(result.visible.map(r=>r.values.netPay).sort((a,b)=>a-b)).toEqual([1000,1200,1950]);
  expect(result.analysis.totalNet).toBeNull();
});
for(const width of [360,412]) test(`PDF source selection survives replay and reload at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:915});await page.goto('/index.html');
 await page.locator('#betaImportOpen').click();
 for (const [name,marker] of [['Päätyö','A'],['Keikat','B']]) {
   const details=page.locator('details').filter({has:page.locator('#createIncomeSource')});
   if(!await details.evaluate(node=>node.open)) await details.locator('summary').click();
   await page.locator('#incomeSourceName').fill(name);
   await page.locator('#createIncomeSource').click();
   await expect(page.locator('#incomeSourceSelect option:checked')).toHaveText(name);
   await page.locator('#pdfInput').setInputFiles(pdf('1 900,00',marker));
   await expect.poll(async()=>(await state(page)).rows.length).toBe(marker==='A'?1:2);
 }
 await page.locator('#pdfInput').setInputFiles(pdf());
 await expect(page.locator('#status')).toContainText('ilman tuplaa');
 await page.reload();
 const saved=await state(page);expect(saved.analysis.totalGross).toBe(6000);
 expect(saved.analysis.latestYtd).toBeNull();
 await page.getByRole('button',{name:'Kalenteri',exact:true}).click();
 await expect(page.locator('#history')).toContainText('Päätyö');
 await expect(page.locator('#history')).toContainText('Keikat');
});
