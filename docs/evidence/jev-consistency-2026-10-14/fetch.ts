// Fetch each page once and freeze its extracted text, so every run scores identical input.
// Usage: npx tsx fetch.ts <out pages.json> <url> [url ...]
import { extractPage } from "../../../src/extract";
import { writeFileSync } from "node:fs";
const urls = process.argv.slice(3);
(async () => {
  const out: any[] = [];
  for (const u of urls) {
    const e = await extractPage(u);
    out.push({ url: u, fetchedAt: new Date().toISOString(), source: e.source, warnings: e.warnings, meta: e.meta, body: e.body });
  }
  writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(out.map((p) => `${p.url} ${p.body.length}`).join("\n"));
})();
