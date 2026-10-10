import { test, expect } from "@playwright/test";

test("@smoke mobiilin ydinpolku avautuu ilman vaakavieritystä", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.getByRole("heading", { name: "Palkka", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Seuranta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Historia" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Data" })).toBeVisible();
  await expect(page.getByText("Valitse palkkalaskelma PDF")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Data-välilehti kertoo paikallisen tallennuksen ja tietosuojan", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Data" }).click();

  await expect(page.getByRole("heading", { name: "Vain seurannan tarvitsema data" })).toBeVisible();
  await expect(page.getByText("IndexedDB", { exact: true })).toBeVisible();
  await expect(page.getByText(/0 palkkalaskelmaa paikallisesti/)).toBeVisible();
  await expect(page.getByText(/Alkuperäistä PDF-tiedostoa/)).toBeVisible();
});

test("Historia-välilehti toimii oikean navigaatiopolun kautta", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Historia" }).click();

  await expect(page.getByRole("heading", { name: "Tallennetut laskelmat" })).toBeVisible();
  await expect(page.getByText(/Ei tallennettuja laskelmia vuodelta/)).toBeVisible();
});

test("reload ei kadota paikallisen tietokannan käyttövalmiutta", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#status")).toContainText("Ei ladattua dokumenttia");
  await page.reload();
  await expect(page.locator("#status")).toContainText("Ei ladattua dokumenttia");
  await expect(page.locator("#recordCount")).toContainText("0 palkkalaskelmaa");
});
