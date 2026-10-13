// Run engine: calibration and analysis, driven from the browser one request at a time.
// Every answer is written to IndexedDB as it arrives, so an interrupted calibration resumes.

import { db, newId } from "./db";
import * as api from "./api";
import { fingerprint } from "./fingerprint";
import { removeRepeatedLines } from "./sitepass";
import { score, stat, termSum, splitsIntoClusters } from "./score";
import { PRACTICE } from "./practice";
import type { Calibration, Page, PageText, Profile, Run, Scope } from "./types";
import { SCOPES } from "./types";

export const CALIBRATION_RUNS = 100;

export type Progress = { phase: string; done: number; total: number };
export type OnProgress = (p: Progress) => void;

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>, signal?: AbortSignal) {
  let i = 0;
  let failure: unknown = null;
  const worker = async () => {
    while (i < items.length && !failure && !signal?.aborted) {
      const item = items[i++];
      try {
        await fn(item);
      } catch (e) {
        failure = e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (failure) throw failure;
  if (signal?.aborted) throw new DOMException("Paused", "AbortError");
}

/** Fetch every page's text through the server and apply the site pass. */
export async function extractPages(pages: Page[], concurrency: number, onProgress?: OnProgress, signal?: AbortSignal) {
  const out: Record<string, PageText> = {};
  let done = 0;
  await pool(pages, concurrency, async (p) => {
    const e = await api.extract(p.url, signal);
    out[p.id] = { meta: e.meta, body: e.body };
    onProgress?.({ phase: "Reading pages", done: ++done, total: pages.length });
  }, signal);
  const ids = pages.map((p) => p.id);
  const cleaned = removeRepeatedLines(ids.map((id) => out[id]));
  return Object.fromEntries(ids.map((id, i) => [id, cleaned[i]])) as Record<string, PageText>;
}

async function ask(text: PageText, scope: Scope, intent: string, terms: string[], signal?: AbortSignal) {
  const [a, b] = await Promise.all([api.askIntent(text, scope, intent, signal), api.askTerms(text, scope, terms, signal)]);
  return { intentFit: a.score, probabilities: a.probabilities, ratings: b.ratings, model: a.model };
}

/** Question check: practice texts with an obvious answer must rank their target first and fit their intent. */
export async function practiceCheck(signal?: AbortSignal) {
  const results = [];
  for (const p of PRACTICE) {
    const r = await ask({ meta: p.meta, body: p.body }, "page", p.intent, p.terms, signal);
    const top = p.terms[r.ratings.indexOf(Math.max(...r.ratings))];
    results.push({ name: p.name, pass: top === p.target && r.intentFit >= 0.75, topTerm: top, intentFit: r.intentFit });
  }
  return results;
}

export async function currentFingerprint(profile: Profile, pages: Page[], model: string, questionVersion: string) {
  return fingerprint(profile, pages, model, questionVersion);
}

export async function startCalibration(
  profile: Profile, pages: Page[], cfg: { model: string; questionVersion: string; concurrency: number },
  onProgress: OnProgress, signal?: AbortSignal,
): Promise<string> {
  const included = pages.filter((p) => p.included);
  if (!included.length) throw new Error("Tick at least one page");
  for (const p of included) {
    if (!p.intent.trim()) throw new Error(`${p.path} has no intent statement`);
    if (p.expected.length !== 10) throw new Error(`${p.path} needs exactly 10 expected terms`);
  }
  onProgress({ phase: "Checking the questions", done: 0, total: PRACTICE.length });
  const practice = await practiceCheck(signal);
  if (practice.some((p) => !p.pass)) {
    throw new Error(`Question check failed: ${practice.filter((p) => !p.pass).map((p) => p.name).join(", ")}. Calibration not started.`);
  }
  const texts = await extractPages(included, cfg.concurrency, onProgress, signal);
  const cal: Calibration = {
    id: newId(), profileId: profile.id, createdAt: Date.now(), model: cfg.model, questionVersion: cfg.questionVersion,
    fingerprint: await fingerprint(profile, pages, cfg.model, cfg.questionVersion),
    runsTarget: CALIBRATION_RUNS, status: "running", pageIds: included.map((p) => p.id), texts, practice,
  };
  await db.calibrations.put(cal);
  await resumeCalibration(cal.id, cfg.concurrency, onProgress, signal);
  return cal.id;
}

export async function resumeCalibration(calibrationId: string, concurrency: number, onProgress: OnProgress, signal?: AbortSignal) {
  const cal = await db.calibrations.get(calibrationId);
  if (!cal) throw new Error("Calibration not found");
  const profile = (await db.profiles.get(cal.profileId))!;
  const pages = new Map((await db.pages.where({ profileId: cal.profileId }).toArray()).map((p) => [p.id, p]));
  const doneKeys = new Set(
    (await db.calibrationRuns.where({ calibrationId }).toArray()).map((r) => `${r.pageId}|${r.scope}|${r.run}`),
  );
  const tasks: { pageId: string; scope: Scope; run: number }[] = [];
  for (let run = 0; run < cal.runsTarget; run++)
    for (const pageId of cal.pageIds) for (const scope of SCOPES) if (!doneKeys.has(`${pageId}|${scope}|${run}`)) tasks.push({ pageId, scope, run });
  const total = cal.pageIds.length * SCOPES.length * cal.runsTarget;
  let done = total - tasks.length;
  onProgress({ phase: "Calibrating", done, total });
  try {
    await pool(tasks, concurrency, async (t) => {
      const page = pages.get(t.pageId)!;
      const r = await ask(cal.texts[t.pageId], t.scope, page.intent, profile.terms, signal);
      await db.calibrationRuns.put({
        calibrationId, pageId: t.pageId, scope: t.scope, run: t.run, intentFit: r.intentFit, terms: r.ratings,
        score: score(profile.terms, r.ratings, page.expected, r.intentFit),
      });
      onProgress({ phase: "Calibrating", done: ++done, total });
    }, signal);
  } catch (e: any) {
    if (e instanceof api.ApiError && e.code === "model_mismatch") {
      await db.calibrations.update(calibrationId, { status: "failed", error: e.message });
    }
    throw e;
  }
  await finishCalibration(calibrationId);
}

export async function finishCalibration(calibrationId: string) {
  const cal = (await db.calibrations.get(calibrationId))!;
  const rows = await db.calibrationRuns.where({ calibrationId }).toArray();
  const pageStats: Calibration["pageStats"] = {};
  const clusters: string[] = [];
  for (const pageId of cal.pageIds) {
    pageStats[pageId] = {} as any;
    for (const scope of SCOPES) {
      const xs = rows.filter((r) => r.pageId === pageId && r.scope === scope).map((r) => r.score);
      pageStats[pageId][scope] = stat(xs);
      if (splitsIntoClusters(xs)) clusters.push(`${pageId}:${scope}`);
    }
  }
  const siteSd = Object.fromEntries(SCOPES.map((s) => [s, stat(cal.pageIds.map((id) => pageStats[id][s].sd)).mean])) as Record<Scope, number>;
  await db.calibrations.update(calibrationId, {
    status: "complete", completedAt: Date.now(), pageStats, siteSd,
    error: clusters.length ? `Scores split into two clusters on ${clusters.length} page and scope pair(s)` : undefined,
  });
}

export async function runAnalysis(
  profile: Profile, pages: Page[], calibration: Calibration, cfg: { concurrency: number },
  label: string, onProgress: OnProgress, signal?: AbortSignal,
): Promise<string> {
  const included = pages.filter((p) => calibration.pageIds.includes(p.id));
  const run: Run = { id: newId(), profileId: profile.id, calibrationId: calibration.id, createdAt: Date.now(), label, status: "running" };
  await db.runs.put(run);
  try {
    const texts = await extractPages(included, cfg.concurrency, onProgress, signal);
    const tasks = included.flatMap((p) => SCOPES.map((scope) => ({ p, scope })));
    let done = 0;
    await pool(tasks, cfg.concurrency, async ({ p, scope }) => {
      const r = await ask(texts[p.id], scope, p.intent, profile.terms, signal);
      if (r.model !== calibration.model) throw new api.ApiError("model_mismatch", `Jev answered with ${r.model}`, 409);
      await db.results.put({
        runId: run.id, pageId: p.id, scope, text: texts[p.id], intentFit: r.intentFit, intentProbabilities: r.probabilities,
        terms: r.ratings, termSum: termSum(profile.terms, r.ratings, p.expected),
        score: score(profile.terms, r.ratings, p.expected, r.intentFit), model: r.model,
      });
      onProgress({ phase: "Scoring pages", done: ++done, total: tasks.length });
    }, signal);
    const results = await db.results.where({ runId: run.id }).toArray();
    const profileScore = Object.fromEntries(
      SCOPES.map((s) => [s, stat(results.filter((r) => r.scope === s).map((r) => r.score)).mean]),
    ) as Record<Scope, number>;
    await db.runs.update(run.id, { status: "complete", profileScore });
  } catch (e: any) {
    await db.runs.update(run.id, { status: "failed", error: e?.message ?? String(e) });
    throw e;
  }
  return run.id;
}
