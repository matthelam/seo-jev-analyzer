// Browser database (IndexedDB through Dexie). Everything the app keeps lives here.

import Dexie, { type Table } from "dexie";
import type { Calibration, CalibrationRun, Page, Profile, Result, Run } from "./types";

export type Setting = { key: string; value: unknown };

export class AppDB extends Dexie {
  profiles!: Table<Profile, string>;
  pages!: Table<Page, string>;
  calibrations!: Table<Calibration, string>;
  calibrationRuns!: Table<CalibrationRun, [string, string, string, number]>;
  runs!: Table<Run, string>;
  results!: Table<Result, [string, string, string]>;
  settings!: Table<Setting, string>;

  constructor(name = "seo-jev-analyzer") {
    super(name);
    this.version(1).stores({
      profiles: "id, updatedAt",
      pages: "id, profileId",
      calibrations: "id, profileId, createdAt",
      calibrationRuns: "[calibrationId+pageId+scope+run], calibrationId",
      runs: "id, profileId, createdAt",
      results: "[runId+pageId+scope], runId",
      settings: "key",
    });
  }
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
  await db.transaction("rw", [db.profiles, db.pages, db.calibrations, db.calibrationRuns, db.runs, db.results], async () => {
    const cals = await db.calibrations.where({ profileId }).primaryKeys();
    for (const c of cals) await db.calibrationRuns.where({ calibrationId: c }).delete();
    const runs = await db.runs.where({ profileId }).primaryKeys();
    for (const r of runs) await db.results.where({ runId: r }).delete();
    await db.calibrations.where({ profileId }).delete();
    await db.runs.where({ profileId }).delete();
    await db.pages.where({ profileId }).delete();
    await db.profiles.delete(profileId);
  });
}

export async function deleteRun(runId: string) {
  await db.transaction("rw", [db.runs, db.results], async () => {
    await db.results.where({ runId }).delete();
    await db.runs.delete(runId);
  });
}
