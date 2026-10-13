// Shared types for the browser database, the run engine and the API routes.

export type Scope = "meta" | "page";
export const SCOPES: Scope[] = ["meta", "page"];

export type PageMeta = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  jsonLd: string[];
};

export type PageText = { meta: PageMeta; body: string };

export type Profile = {
  id: string;
  name: string;
  domain: string; // e.g. https://example.com
  sitemapUrl: string;
  pathFilter: string;
  terms: string[];
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
  expected: string[]; // ordered, 10 terms from profile.terms
  included: boolean;
};

export type CalibrationStatus = "running" | "complete" | "failed";

export type Stat = { mean: number; sd: number; n: number };

export type Calibration = {
  id: string;
  profileId: string;
  createdAt: number;
  completedAt?: number;
  model: string;
  questionVersion: string;
  fingerprint: string;
  runsTarget: number;
  status: CalibrationStatus;
  error?: string;
  pageIds: string[];
  texts: Record<string, PageText>; // page text snapshot used for every repetition
  practice?: { name: string; pass: boolean; topTerm: string; intentFit: number }[];
  pageStats?: Record<string, Record<Scope, Stat>>; // score mean and SD per page and scope
  siteSd?: Record<Scope, number>;
};

export type CalibrationRun = {
  calibrationId: string;
  pageId: string;
  scope: Scope;
  run: number;
  intentFit: number;
  terms: number[]; // one rating per profile term, 0 to 1
  score: number;
};

export type RunStatus = "running" | "complete" | "failed";

export type Run = {
  id: string;
  profileId: string;
  calibrationId: string;
  createdAt: number;
  label: string;
  status: RunStatus;
  error?: string;
  profileScore?: Record<Scope, number>;
};

export type Result = {
  runId: string;
  pageId: string;
  scope: Scope;
  text: PageText;
  intentFit: number;
  intentProbabilities: Record<string, number>;
  terms: number[];
  termSum: number;
  score: number;
  model: string;
};

export type JevIntentAnswer = { score: number; probabilities: Record<string, number>; model: string };
export type JevTermsAnswer = { ratings: number[]; model: string };
