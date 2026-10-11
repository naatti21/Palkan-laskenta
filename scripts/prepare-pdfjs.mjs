import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const sourceDir = resolve("node_modules/pdfjs-dist/build");
const targetDir = resolve("vendor/pdfjs");

await mkdir(targetDir, { recursive: true });

for (const name of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
  await copyFile(resolve(sourceDir, name), resolve(targetDir, name));
}

console.log("Prepared local PDF.js runtime in vendor/pdfjs.");
