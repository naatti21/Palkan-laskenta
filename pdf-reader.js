const PDFJS_URL = new URL("./vendor/pdfjs/pdf.min.mjs", import.meta.url).href;
const PDFJS_WORKER = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

let pdfjsPromise;
async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then(mod => {
      mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return mod;
    });
  }
  return pdfjsPromise;
}

function pageItemsToLines(items, pageNumber) {
  const rows = new Map();
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    const bucket = Math.round(y / 2) * 2;
    if (!rows.has(bucket)) rows.set(bucket, []);
    rows.get(bucket).push({ x, text: item.str.trim(), width: item.width || 0 });
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, parts]) => {
      parts.sort((a, b) => a.x - b.x);
      return {text: parts.map(p => p.text).join(" "), page:pageNumber, x:parts[0].x,
        y, width:Math.max(...parts.map(p=>p.x+p.width))-parts[0].x};
    })
    .filter(item => item.text);
}

export async function extractPdfDocument(file) {
  const pdfjs = await getPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(pageItemsToLines(content.items,pageNumber));
  }
  const lines=pages.flatMap((items,index)=>index===0?items:[null,...items]);
  return {text:pages.map(items=>items.map(item=>item.text).join("\n")).join("\n\n"),
    lines};
}

// Retain the original public text API for consumers that do not need line geometry.
export async function extractPdfText(file) {
  return (await extractPdfDocument(file)).text;
}
