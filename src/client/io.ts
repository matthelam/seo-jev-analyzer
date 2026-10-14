// Export and import. The export file holds a profile document (the format score_page reads from profileUrl)
// and every run's results. Import always creates a new profile.

import { parseProfile } from "@/core/profile";
import { ScoreResult } from "@/core/schema";
import { profileScore } from "@/core/summary";
import { convertV1, db, newId } from "./db";
import { toProfileDocument } from "./profileDoc";

export const SCHEMA_VERSION = 2;

export async function exportProfile(profileId: string) {
  const profile = (await db.profiles.get(profileId))!;
  const pages = await db.pages.where({ profileId }).toArray();
  const runs = (await db.runs.where({ profileId }).sortBy("createdAt")).filter((r) => r.status === "complete");
  const out = {
    app: "seo-jev-analyzer",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profile: toProfileDocument(profile, pages),
    runs: await Promise.all(runs.map(async (r) => ({
      label: r.label, createdAt: new Date(r.createdAt).toISOString(), runsPerPage: r.runsPerPage,
      results: (await db.scores.where({ runId: r.id }).toArray()).map((s) => s.result),
    }))),
  };
  await db.profiles.update(profileId, { lastExportedAt: Date.now() });
  return out;
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

/** Imports a version 2 export, a bare profile document, or a version 1 export. Returns the new profile id. */
export async function importProfile(data: any): Promise<string> {
  const doc = parseProfile(data);
  const now = Date.now();
  const pid = newId();
  const pageIds = new Map(doc.pages.map((p) => [p.url, newId()]));
  const pages = doc.pages.map((p) => ({ ...p, id: pageIds.get(p.url)!, profileId: pid }));
  const profile = {
    id: pid, name: doc.name, domain: doc.domain, sitemapUrl: doc.sitemapUrl, pathFilter: doc.pathFilter, terms: doc.terms,
    boilerplate: data?.schemaVersion === 1 ? undefined : doc.boilerplate, createdAt: now, updatedAt: now,
  };
  type In = { label: string; createdAt: number; runsPerPage: number; results: { url: string; result: ScoreResult }[] };
  const runs: In[] = [];
  if (data?.schemaVersion === 2) {
    for (const r of data.runs ?? []) runs.push({ label: r.label, createdAt: Date.parse(r.createdAt), runsPerPage: r.runsPerPage ?? 1, results: r.results.map((x: unknown) => { const res = ScoreResult.parse(x); return { url: res.page, result: res }; }) });
  } else if (data?.schemaVersion === 1) {
    const v1Pages = new Map((data.pages ?? []).map((p: any) => [p.id, p]));
    for (const run of (data.runs ?? []).filter((r: any) => r.status === "complete")) {
      const rows = (data.results ?? []).filter((x: any) => x.runId === run.id);
      const results: In["results"] = [];
      for (const pageId of new Set<string>(rows.map((x: any) => x.pageId))) {
        const page: any = v1Pages.get(pageId);
        const res = page ? convertV1(run, data.profile, page, rows.filter((x: any) => x.pageId === pageId)) : null;
        if (res) results.push({ url: page.url, result: res });
      }
      runs.push({ label: run.label, createdAt: run.createdAt, runsPerPage: 1, results });
    }
  }
  await db.transaction("rw", [db.profiles, db.pages, db.runs, db.scores], async () => {
    await db.profiles.put(profile);
    await db.pages.bulkPut(pages);
    for (const r of runs) {
      const id = newId();
      const stored = r.results.filter((x) => pageIds.has(x.url)).map((x) => ({ runId: id, pageId: pageIds.get(x.url)!, result: x.result }));
      await db.runs.put({ id, profileId: pid, createdAt: r.createdAt, label: r.label, status: "complete", runsPerPage: r.runsPerPage, pageIds: stored.map((x) => x.pageId), model: stored[0]?.result.model, profileScore: profileScore(stored.map((x) => x.result)) });
      await db.scores.bulkPut(stored);
    }
  });
  return pid;
}
