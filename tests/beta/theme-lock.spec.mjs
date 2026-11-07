import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Approved sharp/dark Beta theme. This test intentionally blocks incidental
// stylesheet changes while the product work is function-only.
const locked = {
  "styles.css":"57571bd5c8ba6bb8d9011fe69831b9c1a856860f",
  "beta-precision-tokens.css":"213cde967eca6e45869d817782422ac8ecb78627",
  "beta-theme-v2.css":"363b3819588e382c8b18714d2fc7c430fccd8e5f",
  "beta-planner-theme-v2.css":"cc17e276a8dc017973da007b8bdf1d692aa82cb0",
  "beta-cards-v3.css":"d9566167c88cd9b5f2cbea84473e1de73f2bf90e",
  "beta-info-v4.css":"cfdebd0603355746939689e4b5b8e414a331b8e5",
  "beta-black-v5.css":"f4cb85ea3fb7cfc18801c5513295ce1429e47154",
  "beta-planner-black-v5.css":"8a36e8955e0bc72680e41440229bdb09a5a8fec2"
};

test("locked Beta theme files are byte-for-byte unchanged", () => {
  for (const [path, expected] of Object.entries(locked)) {
    const file = readFileSync(new URL("../../"+path,import.meta.url));
    const actual = createHash("sha1").update("blob "+file.length+"\0").update(file).digest("hex");
    expect(actual,"Locked theme drift: "+path).toBe(expected);
  }
});
