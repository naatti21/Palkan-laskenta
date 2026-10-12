import { test, expect } from "@playwright/test";

function makeTextPdf(lines) {
  const escapePdf = value => String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

  const content = [
    "BT",
    "/F1 10 Tf",
    "50 790 Td",
    "14 TL",
    ...lines.flatMap((line, index) => [
      `(${escapePdf(line)}) Tj`,
      ...(index < lines.length - 1 ? ["T*"] : [])
    ]),
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}


test("manual 49:15 as-of Oct 12 and backup restore keep revisions and leave payslips untouched",async({page})=>{
 await page.goto("/index.html");
 await page.getByRole("button",{name:"Data"}).click();
 await expect(page.locator("#bankLatest")).toContainText("Ei vielä");
 await page.locator("#bankOpenForm").click();
 await page.locator("#bankBalanceInput").fill("49:15");
 await page.locator("#bankDateInput").fill("2026-10-12");
 await page.locator("#bankSourceInput").selectOption("time-system");
 await page.locator("#bankSaveButton").click();
 await expect(page.locator("#bankLatest")).toContainText("49 h 15 min");
 await expect(page.locator("#bankLatest")).toContainText("12.10.2026");
 await page.locator("[data-bank-edit]").click();
 await page.locator("#bankBalanceInput").fill("49,5");
 await page.locator("#bankSaveButton").click();
 await expect(page.locator("#bankLatest")).toContainText("49 h 30 min");
 const item=await page.evaluate(async()=> (await import("/storage.js")).getSetting("worktimeBankAnchors:v1"));
 expect(item).toHaveLength(1);
 expect(item[0].corrections[0].balanceMinutes).toBe(2955);
 const exportWaiting=page.waitForEvent("download");
 await page.locator("#exportButton").click();
 const download=await exportWaiting;
 const {readFile}=await import("node:fs/promises");
 const backup=JSON.parse(await readFile(await download.path(),"utf8"));
 expect(backup.bankSnapshots[0].balanceMinutes).toBe(2970);
 expect(backup.bankSnapshots[0].asOfDate).toBe("2026-10-12");
 await page.evaluate(async()=> {
   const s=await import("/storage.js");
   await s.setSetting("worktimeBankAnchors:v1",null);
 });
 await page.reload();
 await page.getByRole("button",{name:"Data"}).click();
 await expect(page.locator("#bankLatest")).toContainText("Ei vielä");
 await page.locator("#backupInput").setInputFiles({name:"synthetic-bank-backup.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(backup))});
 await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
 await expect(page.locator("#bankLatest")).toContainText("49 h 30 min");
 await page.locator("#backupInput").setInputFiles({name:"synthetic-bank-backup.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(backup))});
 const item2=await page.evaluate(async()=> (await import("/storage.js")).getSetting("worktimeBankAnchors:v1"));
 expect(item2).toHaveLength(1);
 expect(item2[0].corrections[0].balanceMinutes).toBe(2955);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 expect(overflow).toBeLessThanOrEqual(1);
});

test("real synthetic PDF upload triggers optional ask for newest work period only once",async({page})=>{
 await page.goto("/index.html");
 const lines=(start,end,payDate,gross,ytd)=>[
  "PALKKALASKELMA",
  `Palkkakausi ${start} - ${end}`,
  `Maksupäivä ${payDate}`,
  "Maksetaan 2 678,39",
  "KERTYMÄ PALKKAKAUDELTA",
  `Ennakonpid. al. tul ${gross}`,
  "KERTYMÄ VUODEN ALUSTA",
  `Ennakonpid. al. tul ${ytd}`
 ];
 const upload=async(name,start,end,payDate,gross,ytd)=>{
  await page.locator("#pdfInput").setInputFiles({name,mimeType:"application/pdf",
    buffer:makeTextPdf(lines(start,end,payDate,gross,ytd))});
 };
 await upload("qa-first.pdf","3.8.2026","16.8.2026","28.8.2026","4 698,11","63 832,82");
 await expect(page.locator("#resultSection")).toBeVisible();
 await expect(page.locator("#bankPrompt")).toBeVisible();
 await page.locator("#bankPromptLater").click();
 await expect(page.locator("#bankPrompt")).toBeHidden();
 await upload("qa-first.pdf","3.8.2026","16.8.2026","28.8.2026","4 698,11","63 832,82");
 await expect(page.locator("#bankPrompt")).toBeHidden();
 await upload("qa-old.pdf","20.7.2026","2.8.2026","14.8.2026","3 698,11","59 134,71");
 await expect(page.locator("#resultSection")).toBeVisible();
 await expect(page.locator("#bankPrompt")).toBeHidden();
 await upload("qa-new.pdf","17.8.2026","30.8.2026","11.9.2026","4 000,11","67 832,93");
 await expect(page.locator("#bankPrompt")).toBeVisible();
 await page.locator("#bankPromptSave").click();
 await expect(page.getByRole("heading",{name:"Työaikapankin saldo"})).toBeVisible();
 await expect(page.locator("#bankFormPanel")).toBeVisible();
 await page.locator("#bankBalanceInput").fill("49:15");
 await page.locator("#bankDateInput").fill("2026-10-12");
 await page.locator("#bankSaveButton").click();
 await expect(page.locator("#bankLatest")).toContainText("49 h 15 min");
 const count=await page.evaluate(async()=>(await (await import("/storage.js")).getAllRecords()).length);
 expect(count).toBe(3);
});

test("backup import never shows saldoprompt; permanent skip can be reversed",async({page})=>{
 await page.goto("/index.html");
 const backup=await page.evaluate(async()=>{
   const m=await import("/model.js");
   const x=m.migrateLegacyRecord({recordSchemaVersion:1,id:"backup-historical",
    kind:"payslip",values:{payDate:"2026-09-11",payPeriodStart:"2026-08-17",payPeriodEnd:"2026-08-30",
    grossPay:3500,netPay:2100,ytdTaxableIncome:42000},
    payLines:[],fingerprints:["backup-test"],fieldMeta:{},corrections:{},notices:[],
    parser:{version:"test",confidence:1,documentType:"payslip",sourceProfile:"test"}});
   return JSON.stringify(m.makeBackup([x]));
 });
 await page.getByRole("button",{name:"Data"}).click();
 await page.locator("#backupInput").setInputFiles({name:"old-backup.json",mimeType:"application/json",buffer:Buffer.from(backup)});
 await expect(page.locator("#bankPrompt")).toBeHidden();
 await page.evaluate(async()=> {
  await (await import("/storage.js")).setSetting("worktimeBankPrompt:v1",{muted:true,lastAskedPeriodEnd:null});
 });
 await page.reload();
 await page.getByRole("button",{name:"Data"}).click();
 await expect(page.locator("#bankUnmute")).toBeVisible();
 await page.locator("#bankUnmute").click();
 await expect(page.locator("#bankUnmute")).toBeHidden();
 await expect(page.locator("#bankLatest")).toContainText("Ei vielä");
});
