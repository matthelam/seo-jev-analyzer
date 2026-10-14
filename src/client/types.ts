// What the browser stores. Score results are stored exactly as the engine returned them.

import type { ScoreResult, Scope } from "@/core/schema";

export type Profile = {
  id: string;
  name: string;
  domain: string;
  sitemapUrl: string;
  pathFilter: string;
  terms: string[];
  /** Body lines removed before scoring; undefined until found from the included pages. */
  boilerplate?: string[];
  createdAt: number;
  updatedAt: number;
  lastExportedAt?: number;
};

export type Page = {
  id: string;
  profileId: string;
  url: string;
  path: string;
  intent: string;
  expected: string[];
  included: boolean;
};

export type RunStatus = "running" | "complete" | "failed";

export type Run = {
  id: string;
  profileId: string;
  createdAt: number;
  label: string;
  status: RunStatus;
  error?: string;
  runsPerPage: number;
  model?: string;
  pageIds: string[];
  profileScore?: Partial<Record<Scope, number>>;
};

export type StoredResult = { runId: string; pageId: string; result: ScoreResult };
