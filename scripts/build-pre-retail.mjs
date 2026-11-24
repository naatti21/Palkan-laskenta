import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const origin = process.env.PRE_RETAIL_ORIGIN;
if (origin !== "http://127.0.0.1:4190") {
  throw new Error("PRE_RETAIL_ORIGIN must be http://127.0.0.1:4190. This build has no release target.");
}
const output = "_pre-retail";
const version = "Palkka Pre-retail v0.1";
const commit = execFileSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"}).trim();
const inputs = {
  ...Object.fromEntries([
    "app.js", "parser.js", "model.js", "storage.js", "learning.js", "analytics.js",
    "insights.js", "insights-ui.js", "taxcard-forecast.js", "scenario-model.js", "scenario-ui.js",
    "pdf-reader.js", "beta-compact.mjs", "beta-weekend-tracker.mjs", "beta-ledger.mjs",
    "beta-salary-comparison.mjs", "icon-192.png", "icon-512.png",
    "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs",
    "experiments/year-planner/index.html"
  ].map(path => [path, path])),
  "index.html": "pre-retail/index.html",
  "pre-retail.css": "pre-retail/styles.css",
  "pre-retail-entry.mjs": "pre-retail/entry.mjs",
  "pre-retail-navigation.mjs": "pre-retail/navigation.mjs",
  "experiments/year-planner/net-reference-2026.mjs": "beta-net-reference-2026.mjs",
  "experiments/year-planner/ab-summary-model.mjs": "beta-ab-summary-model.mjs",
  "experiments/year-planner/ab-summary-v6.mjs": "beta-ab-summary-v6.mjs"
};

const files = new Map();
for (const [target, source] of Object.entries(inputs)) files.set(target, await readFile(source));
async function bundleStyles(target, order) {
  const layers = await Promise.all(order.map(path => readFile(path, "utf8")));
  files.set(target, layers.join("\n"));
}
await bundleStyles("styles.css", [
  "styles.css", "pre-retail/legacy-layout.css", "beta-theme-v2.css",
  "beta-cards-v3.css", "beta-info-v4.css", "beta-precision-tokens.css",
  "beta-black-v5.css", "beta-salary-comparison.css", "pre-retail/legacy-import.css"
]);
await bundleStyles("experiments/year-planner/pre-retail-planner.css", [
  "beta-planner-theme-v2.css", "beta-precision-tokens.css", "beta-planner-black-v5.css", "pre-retail/planner.css"
]);

const manifest = JSON.parse(await readFile("manifest.webmanifest", "utf8"));
files.set("manifest.webmanifest", JSON.stringify({
  ...manifest, id: "./palkka-pre-retail", name: version, short_name: "Palkka 0.1",
  description: "Paikallinen palkkahistoria ja työviikonloppujen suunnittelu.",
  theme_color: "#0b1015", background_color: "#0b1015"
}, null, 2));
files.set("_headers", "/*\n  X-Robots-Tag: noindex, nofollow\n/sw.js\n  Cache-Control: no-cache\n");

const hash = createHash("sha256").update(origin).update(commit).update(await readFile(new URL(import.meta.url)));
const worker = await readFile("pre-retail/sw.js", "utf8");
hash.update(worker);
for (const [path, data] of files) hash.update(path).update(data);
const revision = hash.digest("hex").slice(0, 16);
files.set("pre-retail-config.mjs", `export const origin=${JSON.stringify(origin)}, revision=${JSON.stringify(revision)}, version=${JSON.stringify(version)};\n`);
files.set("build-info.json", JSON.stringify({ version, commit, revision, origin, environment: "pre-retail" }, null, 2));
const assets = ["./", ...[...files.keys()].filter(path => path !== "_headers").map(path => "./" + path)];
files.set("sw.js", `const CONFIG = ${JSON.stringify({ origin, revision, assets })};\n${worker}`);

await rm(output, {recursive: true, force: true});
for (const [name, data] of files) {
  const path = `${output}/${name}`;
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, data);
}
console.log(`${version} · ${revision} · ${origin}`);
