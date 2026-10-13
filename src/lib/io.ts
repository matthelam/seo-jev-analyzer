// Export and import of one profile as a JSON file. Import always creates a new profile.

import { db, newId } from "./db";
import type { Calibration, CalibrationRun, Page, Profile, Result, Run } from "./types";

export const SCHEMA_VERSION = 1;

export type ProfileExport = {
  app: "seo-jev-analyzer";
  schemaVersion: number;
  exportedAt: string;
  profile: Profile;
  pages: Page[];
  calibrations?: Calibration[];
  calibrationRuns?: CalibrationRun[];
  runs?: Run[];
  results?: Result[];
};

export async function exportProfile(profileId: string): Promise<ProfileExport> {
  const profile = (await db.profiles.get(profileId))!;
  const pages = await db.pages.where({ profileId }).toArray();
  const calibrations = await db.calibrations.where({ profileId }).toArray();
  const calibrationRuns = (await Promise.all(calibrations.map((c) => db.calibrationRuns.where({ calibrationId: c.id }).toArray()))).flat();
  const runs = await db.runs.where({ profileId }).toArray();
  const results = (await Promise.all(runs.map((r) => db.results.where({ runId: r.id }).toArray()))).flat();
  await db.profiles.update(profileId, { lastExportedAt: Date.now() });
  return { app: "seo-jev-analyzer", schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), profile, pages, calibrations, calibrationRuns, runs, results };
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function validate(data: any): asserts data is ProfileExport {
  if (!data || data.app !== "seo-jev-analyzer") throw new Error("Not a seo-jev-analyzer profile file");
  if (data.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported file version ${data.schemaVersion}; this app reads version ${SCHEMA_VERSION}`);
  if (!data.profile?.name || !Array.isArray(data.profile.terms) || !Array.isArray(data.pages)) throw new Error("The file is missing its profile, terms or pages");
}

/** Imports as a new profile with fresh ids; nothing existing is overwritten. Returns the new profile id. */
export async function importProfile(data: unknown): Promise<string> {
  validate(data);
  const d = data;
  const pid = newId();
  const pageMap = new Map(d.pages.map((p) => [p.id, newId()]));
  const calMap = new Map((d.calibrations ?? []).map((c) => [c.id, newId()]));
  const runMap = new Map((d.runs ?? []).map((r) => [r.id, newId()]));
  const mapPages = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [pageMap.get(k) ?? k, v]));
  const now = Date.now();
  await db.transaction("rw", [db.profiles, db.pages, db.calibrations, db.calibrationRuns, db.runs, db.results], async () => {
    await db.profiles.put({ ...d.profile, id: pid, createdAt: d.profile.createdAt ?? now, updatedAt: now, lastExportedAt: undefined });
    await db.pages.bulkPut(d.pages.map((p) => ({ ...p, id: pageMap.get(p.id)!, profileId: pid })));
    await db.calibrations.bulkPut((d.calibrations ?? []).map((c) => ({
      ...c, id: calMap.get(c.id)!, profileId: pid, pageIds: c.pageIds.map((x) => pageMap.get(x) ?? x),
      texts: mapPages(c.texts), pageStats: c.pageStats ? mapPages(c.pageStats) : undefined,
      status: c.status === "running" ? "running" : c.status,
    })));
    await db.calibrationRuns.bulkPut((d.calibrationRuns ?? []).map((r) => ({ ...r, calibrationId: calMap.get(r.calibrationId)!, pageId: pageMap.get(r.pageId)! })));
    await db.runs.bulkPut((d.runs ?? []).map((r) => ({ ...r, id: runMap.get(r.id)!, profileId: pid, calibrationId: calMap.get(r.calibrationId) ?? r.calibrationId })));
    await db.results.bulkPut((d.results ?? []).map((r) => ({ ...r, runId: runMap.get(r.runId)!, pageId: pageMap.get(r.pageId)! })));
  });
  return pid;
}
