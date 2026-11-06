import { test, expect } from "@playwright/test";

// All values here are presentation-only and synthetic; no employee data.
test("Dark Neon keeps near-black neutral surfaces and semantic accents", async ({ page }) => {
  for (const width of [360, 412]) {
    await page.setViewportSize({width, height:860});
    await page.goto("/index.html");
    await expect(page.locator("#pdfInput")).toBeEnabled();
    await expect(page.locator(".beta-compact-dashboard")).toBeVisible();
    await expect(page.locator("#taxCardProgress")).toBeVisible();
    const colors = await page.evaluate(() => {
      const rgb = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
      const color = selector => getComputedStyle(document.querySelector(selector)).color;
      return {
        body: rgb("body"),
        trackingCard: rgb(".beta-compact-dashboard"),
        taxCard: rgb(".beta-taxcard-progress"),
        taxPercent: color(".beta-taxcard-heading span"),
        selectedTab: rgb(".tab.active"),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1
      };
    });
    expect(colors.body).toBe("rgb(5, 8, 12)");
    expect(colors.trackingCard).toBe("rgb(12, 18, 24)");
    expect(colors.taxCard).toBe("rgb(9, 14, 21)");
    expect(colors.taxPercent).toBe("rgb(120, 217, 236)");
    expect(colors.selectedTab).toBe("rgb(17, 26, 33)");
    expect(colors.horizontalOverflow).toBe(false);
    const tokens = await page.locator(':root').evaluate(el => {
      const style = getComputedStyle(el);
      return ['--mint','--cyan','--warn','--amber'].map(key => style.getPropertyValue(key).trim());
    });
    expect(tokens).toEqual(['#72efca','#78d9ec','#f29ca9','#f1c27a']);
  }
});

test("Annual planner shares near-black Dark Neon palette only inside its isolated iframe", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", {name:"Laskuri"}).click();
  await expect(page.locator("#plannerFrame")).toBeVisible();
  const html = page.frameLocator("#plannerFrame").locator("html.beta-integrated");
  await expect(html).toHaveCount(1);
  const palette = await html.evaluate(el => {
    const cs = getComputedStyle(el);
    const firstCard = el.querySelector(".card");
    return {
      ink: cs.getPropertyValue("--ink").trim(),
      mint: cs.getPropertyValue("--mint").trim(),
      panel: getComputedStyle(firstCard).backgroundColor
    };
  });
  expect(palette.ink).toBe("#f0f6f7");
  expect(palette.mint).toBe("#72efca");
  expect(palette.panel).toBe("rgb(12, 18, 24)");
  await expect(page.locator("#pdfInput")).toBeEnabled();
});
