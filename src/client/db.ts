// Browser database (IndexedDB through Dexie). Everything the app keeps lives here.

import Dexie, { type Table } from "dexie";
import { fingerprint, textHash } from "@/core/fingerprint";
import { noiseFloorFor } from "@/core/noise";
import { pointsAvailable } from "@/core/scoring";
import type { ScoreResult } from "@/core/schema";
import type { Page, Profile, Run, StoredResult } from "./types";

export type Setting = { key: string; value: unknown };

export class AppDB extends Dexie {
  profiles!: Table<Profile, string>;
  pages!: Table<Page, string>;
  runs!: Table<Run, string>;
  scores!: Table<StoredResult, [string, string]>;
  settings!: Table<Setting, string>;

  constructor(name = "seo-jev-analyzer") {
    super(name);
    // Version 1: per-profile calibration (removed).
    this.version(1).stores({
      profiles: "id, updatedAt",
      pages: "id, profileId",
      calibrations: "id, profileId, createdAt",
      calibrationRuns: "[calibrationId+pageId+scope+run], calibrationId",
      runs: "id, profileId, createdAt",
      results: "[runId+pageId+scope], runId",
      settings: "key",
    });
    // Version 2: one stored engine result per page per run, converted from version 1 results.
    this.version(2).stores({ scores: "[runId+pageId], runId" }).upgrade(async (tx) => {
      const profiles = new Map((await tx.table("profiles").toArray()).map((p: any) => [p.id, p]));
      const pages = new Map((await tx.table("pages").toArray()).map((p: any) => [p.id, p]));
      const runs = await tx.table("runs").toArray();
      const old = await tx.table("results").toArray();
      for (const run of runs as any[]) {
        const profile: any = profiles.get(run.profileId);
        const rows = old.filter((r: any) => r.runId === run.id);
        const pageIds = [...new Set(rows.map((r: any) => r.pageId))] as string[];
        for (const pageId of pageIds) {
          const page: any = pages.get(pageId);
          const converted = page && profile ? convertV1(run, profile, page, rows.filter((r: any) => r.pageId === pageId)) : null;
          if (converted) await tx.table("scores").put({ runId: run.id, pageId, result: converted });
        }
        await tx.table("runs").put({ ...run, runsPerPage: 1, pageIds, model: rows[0]?.model, calibrationId: undefined });
      }
    });
    // Version 3: drop the calibration tables and the version 1 results.
    this.version(3).stores({ calibrations: null, calibrationRuns: null, results: null });
  }
}

/** Version 1 data was always scored with question set q1; this is a fact about stored data, not the current wording. */
const V1_QUESTION_VERSION = "q1";

/** Converts version 1 results (per scope, calibration era) into one engine result. */
export function convertV1(run: any, profile: any, page: any, rows: any[]): ScoreResult | null {
  const model = rows[0]?.model;
  const floor = model ? noiseFloorFor(model, V1_QUESTION_VERSION) : null;
  if (!floor || page.expected?.length !== 10 || !page.intent) return null;
  const inputs = { intent: page.intent, expected: page.expected, terms: profile.terms };
  const scores: ScoreResult["scores"] = {};
  for (const r of rows) {
    scores[r.scope as "meta" | "page"] = {
      score: r.score, sd: null, termSum: r.termSum, intentFit: r.intentFit, intentProbabilities: r.intentProbabilities ?? {},
      ratings: Object.fromEntries(profile.terms.map((t: string, i: number) => [t, r.terms[i] ?? 0])),
      pointsAvailable: pointsAvailable(profile.terms, r.terms, page.expected, r.intentFit),
    };
  }
  const text = rows[0].text;
  return {
    schema: "seo-jev-analyzer/result@1", page: page.url, scoredAt: new Date(run.createdAt).toISOString(), model, questionVersion: V1_QUESTION_VERSION,
    fingerprint: fingerprint(model, V1_QUESTION_VERSION, inputs), inputs,
    text: { source: "url", meta: text.meta, bodyChars: text.body.length, textHash: textHash(text), warnings: [] },
    runs: 1, noiseFloor: floor.floor, scores,
  };
}

export const db = new AppDB();

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value });

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function deleteProfile(profileId: string) {
  await db.transaction("rw", [db.profiles, db.pages, db.runs, db.scores], async () => {
    const runs = await db.runs.where({ profileId }).primaryKeys();
    for (const r of runs) await db.scores.where({ runId: r }).delete();
    await db.runs.where({ profileId }).delete();
    await db.pages.where({ profileId }).delete();
    await db.profiles.delete(profileId);
  });
}

export async function deleteRun(runId: string) {
  await db.transaction("rw", [db.runs, db.scores], async () => {
    await db.scores.where({ runId }).delete();
    await db.runs.delete(runId);
  });
}
