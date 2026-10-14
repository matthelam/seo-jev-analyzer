// Converts a version 1 export to a version 2 profile file and fills its boilerplate from the live pages.
// Usage: npx tsx scripts/profile-from-v1.ts <in.json> <out.json>

import { readFileSync, writeFileSync } from "node:fs";
import { fromV1 } from "../src/core/profile";
import { SimulatedJudge } from "../src/adapters/jev/simulatedJudge";
import { HtmlPageReader } from "../src/adapters/web/htmlReader";
import { SitemapReader } from "../src/adapters/web/sitemapReader";
import { HttpDocumentFetcher } from "../src/adapters/web/documentFetcher";
import { ScoringEngine } from "../src/engine/engine";

const [inPath, outPath] = process.argv.slice(2);
const doc = fromV1(JSON.parse(readFileSync(inPath, "utf8").replace(/^﻿/, "")));
// Only the page reader is used here; the judge is never called.
const engine = new ScoringEngine(new SimulatedJudge("jev-1.13.0"), new HtmlPageReader(), new SitemapReader(), new HttpDocumentFetcher(), { concurrency: 6 });
engine.findBoilerplate({ urls: doc.pages.filter((p) => p.included).map((p) => p.url) }).then((b) => {
  doc.boilerplate = b.lines;
  writeFileSync(outPath, JSON.stringify({ app: "seo-jev-analyzer", schemaVersion: 2, exportedAt: new Date().toISOString(), profile: doc, runs: [] }, null, 1));
  console.log(`${b.pagesRead} pages read; ${b.lines.length} repeated lines: ${JSON.stringify(b.lines)}`);
});
