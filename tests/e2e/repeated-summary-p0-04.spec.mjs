import {test,expect} from "@playwright/test";

// Real two-page PDF. Different column order on each page, separated by
// neutral lines. This is not a mock of PDF.js, parser, UI or IndexedDB.
function makeRepeatedSummaryPdf(secondYtd="43 000,00") {
  const columns={
    previous:["KERTYMÄ EDELLISELTÄ VUODELTA","55 000,00","-13 750,00"],
    period:["KERTYMÄ PALKKAKAUDELTA","3 500,00","-875,00"],
    ytd:["KERTYMÄ VUODEN ALUSTA","42 000,00","-10 500,00"]
  };
  const before=[[30,580,"PALKKALASKELMA"],[30,550,"Palkkakausi 1.11.2026 - 14.11.2026"],
    [30,525,"Maksupäivä 27.11.2026"],[30,500,"Maksetaan 2 100,00"]];
  const after=[[30,580,"SAMAN PALKKAKAUDEN YHTEENVETO - JATKO"],
    [30,550,"Palkkakausi 1.11.2026 - 14.11.2026"]];
  const addColumns=(rows,order,updatedYtd)=>{
    order.forEach((role,i)=>{
      const values=columns[role];
      const x=30+i*285;
      rows.push([x,390,values[0]],
        [x,360,"Ennakonpid. al. tul "+(role==="ytd"&&updatedYtd?updatedYtd:values[1])],
        [x,333,"Ennakonpidätys "+values[2]]);
    });
  };
  addColumns(before,["previous","period","ytd"],null);
  for(let i=0;i<26;i++)before.push([30,300-i*8,"QA lisatieto "+i+" - ilman rahasummia"]);
  addColumns(after,["ytd","period","previous"],secondYtd);
  const escape=value=>value.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
  const stream=rows=>["BT","/F1 10 Tf",...rows.flatMap(row=>[
    "1 0 0 1 "+row[0]+" "+row[1]+" Tm",
    "("+escape(row[2])+") Tj"
  ]),"ET"].join("\n");
  const contents=[stream(before),stream(after)];
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 620] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 620] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    ...contents.map(content=>"<< /Length "+Buffer.byteLength(content,"latin1")+" >>\nstream\n"+content+"\nendstream"),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  ];
  let pdf="%PDF-1.4\n",offsets=[0];
  objects.forEach((item,i)=>{
    offsets.push(Buffer.byteLength(pdf,"latin1"));
    pdf+=(i+1)+" 0 obj\n"+item+"\nendobj\n";
  });
  const xref=Buffer.byteLength(pdf,"latin1");
  pdf+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(let i=1;i<=objects.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+(objects.length+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
  return Buffer.from(pdf,"latin1");
}

test("QA PDF-P0-04 RED: second page YTD conflict blocks all autosave",async({page})=>{
  await page.setViewportSize({width:412,height:915});
  await page.goto("/index.html");
  await page.locator("#pdfInput").setInputFiles({
    name:"qa-p0-04-multipage-conflict.pdf",mimeType:"application/pdf",
    buffer:makeRepeatedSummaryPdf("43 000,00")
  });
  await expect(page.locator("#status")).toContainText("tarvitsee tarkistuksen");
  await expect(page.locator("#reviewSection")).toBeVisible();
  await expect(page.locator("#reviewGrid")).toContainText("42 000,00");
  await expect(page.locator("#reviewGrid")).toContainText("43 000,00");
  let saved=await page.evaluate(async()=> (await import("/storage.js")).getAllRecords());
  expect(saved).toHaveLength(0);
  await page.reload();
  saved=await page.evaluate(async()=> (await import("/storage.js")).getAllRecords());
  expect(saved).toHaveLength(0);
});

test("QA PDF-P0-04: equal YTD amounts across two tables permit autosave",async({page})=>{
  await page.goto("/index.html");
  await page.locator("#pdfInput").setInputFiles({
    name:"qa-p0-04-equal-tables.pdf",mimeType:"application/pdf",
    buffer:makeRepeatedSummaryPdf("42 000,00")
  });
  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");
  const saved=await page.evaluate(async()=> (await import("/storage.js")).getAllRecords());
  expect(saved).toHaveLength(1);
  expect(saved[0].values.ytdTaxableIncome).toBe(42000);
});
