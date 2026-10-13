import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("PWA-asennusmanifesti ja kuvakkeet löytyvät myös offline-välimuistista", async ({ page, context }) => {
  await page.goto("/index.html");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload();
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const details = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) throw new Error("Manifest link missing");
    const manifestUrl = new URL(link.getAttribute("href"), location.href);
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) throw new Error("Manifest cannot be fetched");
    const manifest = await manifestResponse.json();
    const cache = await caches.open("palkka-pwa-v17");
    const icons = [];

    for (const item of manifest.icons ?? []) {
      const url = new URL(item.src, manifestUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Missing icon ${url}`);
      const bitmap = await createImageBitmap(await response.blob());
      icons.push({
        declared: item.sizes,
        width: bitmap.width,
        height: bitmap.height,
        type: response.headers.get("content-type"),
        cached: Boolean(await cache.match(url))
      });
      bitmap.close();
    }
    return {
      display: manifest.display,
      scope: manifest.scope,
      id: manifest.id,
      startUrl: manifest.start_url,
      icons,
      manifestCached: Boolean(await cache.match(manifestUrl))
    };
  });

  expect(details.display).toBe("standalone");
  expect(details.scope).toBe("./");
  expect(details.id).toBe("./");
  expect(details.startUrl).toBe("./");
  expect(details.manifestCached).toBe(true);
  expect(details.icons).toHaveLength(2);
  expect(details.icons.map(icon => [icon.declared, icon.width, icon.height, icon.cached])).toEqual([
    ["192x192", 192, 192, true],
    ["512x512", 512, 512, true]
  ]);
  expect(details.icons.every(icon => icon.type?.includes("image/png"))).toBe(true);

  await context.setOffline(true);
  const offlineIcons = await page.evaluate(async () => {
    const responses = await Promise.all([
      fetch(new URL("./icon-192.png", location.href)),
      fetch(new URL("./icon-512.png", location.href))
    ]);
    return responses.map(response => response.ok);
  });
  expect(offlineIcons).toEqual([true, true]);
});
