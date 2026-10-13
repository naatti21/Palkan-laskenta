import {test, expect} from "@playwright/test";

// P1-AR-01: the *actual* manual bank UI submits while restoreBackupAtomically
// runs on the same native Chromium IndexedDB origin. No mock storage.
// The old read-then-write UI path could overwrite a successfully restored anchor.
test("P1-AR-01 concurrent manual bank create must preserve restored observation", async ({page}) => {
  await page.goto("/index.html");
  await page.getByRole("button", {name: "Data"}).click();

  await page.evaluate(async () => {
    const s = await import("/storage.js");
    await s.setSetting("worktimeBankAnchors:v1", [{
      id: "bank-before", asOfDate: "2026-10-12", balanceMinutes: 0,
      source: "self", note: "synthetic", recordedAt: "2026-10-12T12:00:00.000Z", corrections: []
    }]);
  });
  await page.reload();
  await page.getByRole("button", {name: "Data"}).click();
  await page.locator("#bankOpenForm").click();
  await page.locator("#bankBalanceInput").fill("2:00");
  await page.locator("#bankDateInput").fill("2026-10-14");
  await page.locator("#bankSourceInput").selectOption("self");

  const restored = await page.evaluate(async () => {
    const s = await import("/storage.js");
    // Begin original UI submit handler, then the real backup store transaction.
    document.querySelector("#bankForm").dispatchEvent(
      new Event("submit", {bubbles: true, cancelable: true})
    );
    await s.restoreBackupAtomically([], {
      bankSnapshots: [{
        id: "bank-after", asOfDate: "2026-10-13", balanceMinutes: -75,
        source: "self", note: "restored synthetic",
        recordedAt: "2026-10-13T08:00:00.000Z", corrections: []
      }]
    });
    return "restore-success";
  });
  expect(restored).toBe("restore-success");
  await expect(page.locator("#bankSaveStatus")).toContainText("Saldo tallennettu");
  const read = () => page.evaluate(async () =>
    (await (await import("/storage.js")).getSetting("worktimeBankAnchors:v1"))
      .map(a => ({id: a.id, minutes: a.balanceMinutes})));
  const state = await read();
  expect(state).toEqual(expect.arrayContaining([
    {id: "bank-before", minutes: 0},
    {id: "bank-after", minutes: -75}
  ]));
  expect(state.some(a => a.id.startsWith("bank-") && a.id !== "bank-before" && a.id !== "bank-after" && a.minutes === 120)).toBe(true);
  expect(state).toHaveLength(3);
  await page.reload();
  expect(await read()).toEqual(state);
});

test("P1-AR-01 concurrent correction must retain restored observation and revision history", async ({page}) => {
  await page.goto("/index.html");
  await page.getByRole("button", {name: "Data"}).click();
  await page.evaluate(async () => {
    const s = await import("/storage.js");
    await s.setSetting("worktimeBankAnchors:v1", [{
      id: "bank-before", asOfDate: "2026-10-12", balanceMinutes: 0,
      source: "self", note: "synthetic", recordedAt: "2026-10-12T12:00:00.000Z", corrections: []
    }]);
  });
  await page.reload();
  await page.getByRole("button", {name: "Data"}).click();
  await page.locator('[data-bank-edit="bank-before"]').click();
  await page.locator("#bankBalanceInput").fill("2:00");
  await page.locator("#bankDateInput").fill("2026-10-14");

  await page.evaluate(async () => {
    const s = await import("/storage.js");
    document.querySelector("#bankForm").dispatchEvent(
      new Event("submit", {bubbles: true, cancelable: true})
    );
    await s.restoreBackupAtomically([], {
      bankSnapshots: [{
        id: "bank-after", asOfDate: "2026-10-13", balanceMinutes: -75,
        source: "self", note: "restored synthetic",
        recordedAt: "2026-10-13T08:00:00.000Z", corrections: []
      }]
    });
  });
  await expect(page.locator("#bankSaveStatus")).toContainText("Saldo korjattu");
  const read = () => page.evaluate(async () =>
    (await (await import("/storage.js")).getSetting("worktimeBankAnchors:v1")));
  const state = await read();
  expect(state).toHaveLength(2);
  expect(state.find(a => a.id === "bank-after")?.balanceMinutes).toBe(-75);
  const correction = state.find(a => a.id === "bank-before");
  expect(correction.balanceMinutes).toBe(120);
  expect(correction.corrections).toHaveLength(1);
  expect(correction.corrections[0].balanceMinutes).toBe(0);
  await page.reload();
  expect(await read()).toEqual(state);
});
