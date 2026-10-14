// Scores every included page of a profile through the engine and stores the results as they arrive.

import { pool } from "@/core/pool";
import { profileScore } from "@/core/summary";
import * as api from "./api";
import { db, newId } from "./db";
import { pageProblems } from "./profileDoc";

export type Progress = { phase: string; done: number; total: number };

export async function runProfile(
  profileId: string,
  opts: { runsPerPage: number; concurrency: number },
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<string> {
  const profile = (await db.profiles.get(profileId))!;
  const pages = (await db.pages.where({ profileId }).toArray()).filter((p) => p.included).sort((a, b) => a.path.localeCompare(b.path));
  if (!pages.length) throw new Error("Tick at least one page");
  const problems = pages.flatMap((p) => pageProblems(profile, p));
  if (problems.length) throw new Error(problems.slice(0, 5).join("; "));

  let boilerplate = profile.boilerplate;
  if (!boilerplate) {
    onProgress({ phase: "Finding repeated lines", done: 0, total: pages.length });
    boilerplate = (await api.findBoilerplate(pages.map((p) => p.url), signal)).lines;
    await db.profiles.update(profileId, { boilerplate });
  }

  const count = await db.runs.where({ profileId }).count();
  const run = { id: newId(), profileId, createdAt: Date.now(), label: count ? `Run ${count + 1}` : "Baseline", status: "running" as const, runsPerPage: opts.runsPerPage, pageIds: pages.map((p) => p.id) };
  await db.runs.put(run);
  let done = 0;
  onProgress({ phase: "Scoring pages", done, total: pages.length });
  try {
    await pool(pages, opts.concurrency, async (p) => {
      const result = await api.scorePage(
        { page: p.url, intent: p.intent, expected: p.expected, terms: profile.terms, boilerplate, runs: opts.runsPerPage },
        signal,
      );
      await db.scores.put({ runId: run.id, pageId: p.id, result });
      onProgress({ phase: "Scoring pages", done: ++done, total: pages.length });
    }, signal);
    const results = (await db.scores.where({ runId: run.id }).toArray()).map((r) => r.result);
    await db.runs.update(run.id, { status: "complete", profileScore: profileScore(results), model: results[0]?.model });
  } catch (e: any) {
    await db.runs.update(run.id, { status: "failed", error: e?.name === "AbortError" ? "Stopped before every page was scored" : e?.message ?? String(e) });
    throw e;
  }
  return run.id;
}
