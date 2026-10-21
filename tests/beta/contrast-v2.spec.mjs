import { test, expect } from "@playwright/test";

// All values here are presentation-only and synthetic; no employee data.
test("Beta v2 uses neutral charcoal with accessible distinct semantic accents", async ({ page }) => {
  for (const width of [360, 412]) {
    await page.setViewportSize({width, height:860});
    await page.goto("/index.html");
    await expect(page.locator("#pdfInput")).toBeDisabled();
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
    expect(colors.body).toBe("rgb(16, 19, 25)");
    expect(colors.trackingCard).toBe("rgb(28, 33, 42)");
    expect(colors.taxCard).toBe("rgb(41, 38, 46)");
    expect(colors.taxPercent).toBe("rgb(255, 157, 176)");
    expect(colors.selectedTab).toBe("rgb(48, 59, 66)");
    expect(colors.horizontalOverflow).toBe(false);
    const css = await page.evaluate(async () => (await fetch("./styles.css")).text());
    expect(css).toContain("--beta-mint: #6de3ae;");
    expect(css).toContain("--beta-blue: #79baff;");
    expect(css).toContain("--beta-coral: #ff8da0;");
    expect(css).toContain("--beta-amber: #ffc376;");
  }
});

test("Annual planner shares Beta v2 palette only inside its isolated iframe", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", {name:"Analyysi"}).click();
  await page.locator(".planner-fold > summary").click();
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
  expect(palette.ink).toBe("#f7f9fd");
  expect(palette.mint).toBe("#70e2ad");
  expect(palette.panel).toBe("rgb(34, 41, 55)");
  await expect(page.locator("#pdfInput")).toBeDisabled();
});
