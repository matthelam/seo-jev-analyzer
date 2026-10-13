// Recomputes every stored number in an exported profile and reports any disagreement.
// Usage: npx tsx scripts/verify-export.ts <profile.json>

import { readFileSync } from "node:fs";
import { score, termSum, stat, pointsAvailable, sdOfMean } from "../src/lib/score";
import type { ProfileExport } from "../src/lib/io";

const file = process.argv[2];
if (!file) throw new Error("Usage: npx tsx scripts/verify-export.ts <profile.json>");
const d: ProfileExport = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
const terms = d.profile.terms;
const pages = new Map(d.pages.map((p) => [p.id, p]));
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;
let checks = 0;
const problems: string[] = [];
const check = (ok: boolean, msg: string) => { checks++; if (!ok) problems.push(msg); };

console.log(`Profile: ${d.profile.name} · ${d.pages.filter((p) => p.included).length} pages · ${terms.length} terms`);

// Inputs
for (const p of d.pages.filter((p) => p.included)) {
  check(p.expected.length === 10, `${p.path}: ${p.expected.length} expected terms, not 10`);
  check(new Set(p.expected).size === p.expected.length, `${p.path}: repeated expected term`);
  for (const t of p.expected) check(terms.includes(t), `${p.path}: expected term "${t}" is not in the term list`);
}

// Calibrations
for (const c of d.calibrations ?? []) {
  const rows = (d.calibrationRuns ?? []).filter((r) => r.calibrationId === c.id);
  const expected = c.pageIds.length * 2 * c.runsTarget;
  console.log(`\nCalibration ${new Date(c.createdAt).toISOString()} · ${c.model} · status ${c.status} · ${rows.length} of ${expected} stored`);
  check(c.status !== "complete" || rows.length === expected, `calibration complete but holds ${rows.length} of ${expected} runs`);
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.pageId}|${r.scope}|${r.run}`;
    check(!seen.has(key), `duplicate calibration run ${key}`);
    seen.add(key);
    const p = pages.get(r.pageId)!;
    check(r.terms.length === terms.length, `calibration run ${key}: ${r.terms.length} ratings for ${terms.length} terms`);
    check(r.intentFit >= 0 && r.intentFit <= 1 && r.terms.every((x) => x >= 0 && x <= 1), `calibration run ${key}: rating outside 0 to 1`);
    check(close(r.score, score(terms, r.terms, p.expected, r.intentFit)), `calibration run ${key}: stored score ${r.score} differs from recomputed`);
  }
  if (c.status === "complete" && c.pageStats) {
    const sds: Record<string, number[]> = { meta: [], page: [] };
    for (const id of c.pageIds) for (const scope of ["meta", "page"] as const) {
      const s = stat(rows.filter((r) => r.pageId === id && r.scope === scope).map((r) => r.score));
      const stored = c.pageStats[id][scope];
      check(close(stored.mean, s.mean, 1e-9) && close(stored.sd, s.sd, 1e-9) && stored.n === s.n, `${pages.get(id)?.path} ${scope}: stored mean/SD ${stored.mean}/${stored.sd} differ from recomputed ${s.mean}/${s.sd}`);
      sds[scope].push(s.sd);
    }
    for (const scope of ["meta", "page"] as const) {
      const site = stat(sds[scope]).mean;
      check(close(c.siteSd![scope], site), `site SD ${scope}: stored ${c.siteSd![scope]} differs from recomputed ${site}`);
      console.log(`  ${scope}: site SD ${site.toFixed(4)} · largest page SD ${Math.max(...sds[scope]).toFixed(4)} · profile-score band ± ${(2 * sdOfMean(sds[scope])).toFixed(4)}`);
    }
  }
  for (const pr of c.practice ?? []) check(pr.pass, `practice text ${pr.name} failed`);
}

// Runs
for (const run of d.runs ?? []) {
  const results = (d.results ?? []).filter((r) => r.runId === run.id);
  const cal = (d.calibrations ?? []).find((c) => c.id === run.calibrationId);
  console.log(`\nRun "${run.label}" ${new Date(run.createdAt).toISOString()} · ${run.status} · ${results.length} results`);
  if (run.status !== "complete") continue;
  check(!!cal && results.length === cal.pageIds.length * 2, `run ${run.label}: ${results.length} results for ${cal?.pageIds.length} pages x 2 scopes`);
  for (const r of results) {
    const p = pages.get(r.pageId)!;
    const sum = termSum(terms, r.terms, p.expected);
    check(close(r.termSum, sum), `${run.label} ${p.path} ${r.scope}: term sum ${r.termSum} vs ${sum}`);
    check(close(r.score, sum * r.intentFit), `${run.label} ${p.path} ${r.scope}: score ${r.score} vs ${sum * r.intentFit}`);
    check(cal ? r.model === cal.model : true, `${run.label} ${p.path}: model ${r.model} differs from calibration ${cal?.model}`);
    const probs = Object.values(r.intentProbabilities ?? {});
    if (probs.length) {
      check(close(probs.reduce((a, b) => a + b, 0), 1, 1e-3), `${run.label} ${p.path} ${r.scope}: intent probabilities sum to ${probs.reduce((a, b) => a + b, 0)}`);
      const weighted = Object.entries(r.intentProbabilities).reduce((a, [k, v]) => a + Number(k) * v, 0) / 4;
      check(close(weighted, r.intentFit, 0.01), `${run.label} ${p.path} ${r.scope}: intent fit ${r.intentFit} vs probability-weighted ${weighted}`);
    }
    const pts = pointsAvailable(terms, r.terms, p.expected, r.intentFit).reduce((a, x) => a + x.points, 0);
    check(close(pts, 10 - r.score, 1e-9), `${run.label} ${p.path} ${r.scope}: points available ${pts} vs 10 - score ${10 - r.score}`);
  }
  for (const scope of ["meta", "page"] as const) {
    const mean = stat(results.filter((r) => r.scope === scope).map((r) => r.score)).mean;
    check(close(run.profileScore![scope], mean), `${run.label} ${scope}: profile score ${run.profileScore![scope]} vs mean ${mean}`);
    console.log(`  ${scope} profile score ${mean.toFixed(3)}`);
  }
  console.log("  page                                  meta   (sum × fit)        page   (sum × fit)        meta in calibration band?");
  for (const id of cal?.pageIds ?? []) {
    const m = results.find((r) => r.pageId === id && r.scope === "meta"), g = results.find((r) => r.pageId === id && r.scope === "page");
    const st = cal?.pageStats?.[id];
    const inBand = st && m ? Math.abs(m.score - st.meta.mean) <= 2 * st.meta.sd + 1e-9 : undefined;
    console.log(`  ${pages.get(id)!.path.padEnd(37)} ${m?.score.toFixed(3).padStart(6)} (${m?.termSum.toFixed(2)} × ${m?.intentFit.toFixed(3)})   ${g?.score.toFixed(3).padStart(6)} (${g?.termSum.toFixed(2)} × ${g?.intentFit.toFixed(3)})   ${inBand === undefined ? "–" : inBand ? "yes" : "NO"}`);
  }
}

console.log(`\n${checks - problems.length} of ${checks} checks agree`);
for (const p of problems.slice(0, 40)) console.log("  MISMATCH " + p);
process.exit(problems.length ? 1 : 0);
