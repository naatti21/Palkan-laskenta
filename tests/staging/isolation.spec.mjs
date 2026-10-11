import { test, expect } from '@playwright/test';
import { makeTextPdf } from './pdf-helper.mjs';
const productionSimulator = 'http://127.0.0.1:4174';
const staging = 'http://127.0.0.1:4175';
async function ready(page, origin) {
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}
async function marker(page, value) {
  await page.evaluate(async value => {
    const storage = await import('/storage.js');
    await storage.setSetting('isolation-probe', value);
    localStorage.setItem('isolation-probe', value);
    const cache = await caches.open('isolation-probe');
    await cache.put('/isolation-probe', new Response(value));
  }, value);
}
async function readMarker(page) {
  return page.evaluate(async () => {
    const storage = await import('/storage.js');
    const cache = await caches.open('isolation-probe');
    return [await storage.getSetting('isolation-probe'), localStorage.getItem('isolation-probe'),
      await (await cache.match('/isolation-probe'))?.text() ?? null];
  });
}
const pdf = (payDate, net) => makeTextPdf(['PALKKALASKELMA', 'Palkkakausi 1.11.2026 - 14.11.2026',
  `Maksupäivä ${payDate}`, `Maksetaan ${net}`, 'KERTYMÄ PALKKAKAUDELTA',
  'Ennakonpid. al. tul 3 500,00', 'KERTYMÄ VUODEN ALUSTA', 'Ennakonpid. al. tul 35 000,00']);
async function upload(page, date, net) {
  await page.locator('#pdfInput').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: pdf(date, net) });
  await expect(page.locator('#status')).toContainText('tallennettiin automaattisesti');
}
async function records(page) {
  return page.evaluate(async () => (await import('/storage.js')).getAllRecords());
}

test('two origins isolate actual records, IndexedDB settings, localStorage and CacheStorage', async ({ context }) => {
  const prod = await context.newPage();
  const stage = await context.newPage();
  await ready(prod, productionSimulator);
  await marker(prod, 'production-simulator');
  await upload(prod, '27.11.2026', '2 100,00');
  const before = await records(prod);
  await ready(stage, staging);
  expect(await readMarker(stage)).toEqual([null, null, null]);
  expect(await records(stage)).toEqual([]);
  await marker(stage, 'staging');
  await upload(stage, '28.11.2026', '2 200,00');
  await stage.reload();
  expect(await readMarker(stage)).toEqual(['staging', 'staging', 'staging']);
  await prod.reload();
  expect(await readMarker(prod)).toEqual(['production-simulator', 'production-simulator', 'production-simulator']);
  expect(await records(prod)).toEqual(before);
  expect((await records(stage))[0].values.netPay).toBe(2200);
  const sw = await stage.evaluate(async () => ({ scope: (await navigator.serviceWorker.ready).scope, caches: await caches.keys() }));
  expect(sw.scope).toBe(staging + '/');
  expect(sw.caches.some(n => n.startsWith('palkka-staging-v'))).toBe(true);
  expect(sw.caches.some(n => n.startsWith('palkka-pwa-v'))).toBe(false);
});

test('staging banner, manifest, mobile navigation, offline history and local PDF.js', async ({ page, context }) => {
  await ready(page, staging);
  await expect(page.locator('#staging-banner')).toContainText('TESTIVERSIO');
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  expect(manifest.name).toBe('Palkka TESTIVERSIO');
  expect(manifest.id).toBe('./');
  expect(manifest.scope).toBe('./');
  await upload(page, '27.11.2026', '2 100,00');
  for (const width of [360, 412]) {
    await page.setViewportSize({ width, height: 915 });
    for (const name of ['Historia', 'Data', 'Seuranta']) {
      await page.getByRole('button', { name, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  }
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#staging-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Historia', exact: true }).click();
  await expect(page.locator('#recordCount')).toContainText('1 palkkalaskelmaa');
  await page.getByRole('button', { name: 'Seuranta', exact: true }).click();
  await upload(page, '28.11.2026', '2 200,00');
  expect((await records(page)).length).toBe(2);
  const icons = await page.evaluate(async () => Promise.all(['/icon-192.png', '/icon-512.png'].map(async p => (await fetch(p)).ok)));
  expect(icons).toEqual([true, true]);
});

test('staging copied to an unapproved origin refuses app and service worker startup', async ({ page }) => {
  await page.goto('http://127.0.0.1:4176');
  await expect(page.locator('#staging-banner')).toContainText('ESTETTY');
  await expect(page.locator('main')).toHaveCount(0);
  const state = await page.evaluate(async () => ({ dbs: await indexedDB.databases(),
    workers: await navigator.serviceWorker.getRegistrations(), caches: await caches.keys(), local: localStorage.length }));
  expect(state).toEqual({ dbs: [], workers: [], caches: [], local: 0 });
});

test('staging worker update preserves records and other cache namespaces', async ({ page }) => {
  const { readFile, writeFile } = await import('node:fs/promises');
  const path = '_staging/sw.js';
  const original = await readFile(path, 'utf8');
  await ready(page, staging);
  await marker(page, 'keep-through-update');
  await upload(page, '27.11.2026', '2 100,00');
  const before = await records(page);
  const cache = /const CACHE = '([^']+)'/.exec(original)[1];
  try {
    await writeFile(path, original.replace(`const CACHE = '${cache}'`, `const CACHE = '${cache}-update-test'`));
    await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
    await page.waitForFunction(async old => {
      const names = await caches.keys();
      return names.includes(old + '-update-test') && !names.includes(old);
    }, cache);
    await page.reload();
    expect(await records(page)).toEqual(before);
    expect(await readMarker(page)).toEqual(['keep-through-update', 'keep-through-update', 'keep-through-update']);
  } finally {
    await writeFile(path, original);
  }
});
