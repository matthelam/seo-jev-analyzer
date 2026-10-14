// Recomputes every stored number in an exported profile file and reports any disagreement.
// Usage: npx tsx scripts/verify-export.ts <profile.json>

import { readFileSync } from "node:fs";
import { parseProfile } from "../src/core/profile";
import { fingerprint } from "../src/core/fingerprint";
import { termSum, stat } from "../src/core/scoring";
import { ScoreResult, SCOPES } from "../src/core/schema";

const file = process.argv[2];
if (!file) throw new Error("Usage: npx tsx scripts/verify-export.ts <profile.json>");
const data = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
if (data.schemaVersion !== 2) throw new Error("Version 1 file: import it into the app and export it again");
const doc = parseProfile(data);
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;
let checks = 0;
const problems: string[] = [];
const check = (ok: boolean, msg: string) => { checks++; if (!ok) problems.push(msg); };

console.log(`Profile: ${doc.name} · ${doc.pages.filter((p) => p.included).length} pages · ${doc.terms.length} terms · ${doc.boilerplate.length} boilerplate lines`);
for (const p of doc.pages.filter((p) => p.included)) {
  check(p.expected.length === 10, `${p.path}: ${p.expected.length} expected terms, not 10`);
  for (const t of p.expected) check(doc.terms.includes(t), `${p.path}: expected term "${t}" is not in the term list`);
}

for (const run of data.runs ?? []) {
  console.log(`\nRun "${run.label}" ${run.createdAt} · ${run.results.length} results · ${run.runsPerPage} run(s) per page`);
  const means: Record<string, number[]> = { meta: [], page: [] };
  for (const raw of run.results) {
    const parsed = ScoreResult.safeParse(raw);
    check(parsed.success, `${raw.page}: does not match the result schema`);
    if (!parsed.success) continue;
    const r = parsed.data;
    check(r.fingerprint === fingerprint(r.model, r.questionVersion, r.inputs), `${r.page}: fingerprint does not match its inputs`);
    for (const s of SCOPES) {
      const x = r.scores[s];
      if (!x) continue;
      means[s].push(x.score);
      const ratings = r.inputs.terms.map((t) => x.ratings[t]);
      check(close(x.termSum, termSum(r.inputs.terms, ratings, r.inputs.expected), 1e-6), `${r.page} ${s}: term sum ${x.termSum} vs ratings`);
      if (r.runs === 1) {
        check(close(x.score, x.termSum * x.intentFit, 1e-6), `${r.page} ${s}: score ${x.score} vs term sum x intent fit`);
        check(close(x.pointsAvailable.reduce((a, b) => a + b.points, 0), 10 - x.score, 1e-6), `${r.page} ${s}: points available do not add up to 10 - score`);
      }
      const probs = Object.entries(x.intentProbabilities);
      if (probs.length) check(close(probs.reduce((a, [, v]) => a + v, 0), 1, 1e-3), `${r.page} ${s}: intent probabilities do not sum to 1`);
    }
    console.log(`  ${r.page.padEnd(60)} meta ${r.scores.meta?.score.toFixed(3) ?? "–"}  page ${r.scores.page?.score.toFixed(3) ?? "–"}  ${r.model}`);
  }
  for (const s of SCOPES) if (means[s].length) console.log(`  ${s} profile score ${stat(means[s]).mean.toFixed(3)}`);
}

console.log(`\n${checks - problems.length} of ${checks} checks agree`);
for (const p of problems.slice(0, 40)) console.log("  MISMATCH " + p);
process.exit(problems.length ? 1 : 0);

