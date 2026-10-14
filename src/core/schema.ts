// Schemas for every value that crosses a boundary: operation inputs and outputs, the profile document,
// and the score result. Types are inferred from these schemas, so there is one definition of each shape.

import { z } from "zod";

export const MAX_RUNS = 10;
export const MAX_TERMS = 100;
export const EXPECTED_COUNT = 10;
/** A body line found on at least this share of pages is boilerplate. */
export const BOILERPLATE_SHARE = 0.8;
/** Self test: the lowest intent fit a practice text may score. */
export const SELF_TEST_MIN_FIT = 0.75;

export const Scope = z.enum(["meta", "page"]);
export type Scope = z.infer<typeof Scope>;
export const SCOPES: Scope[] = ["meta", "page"];

export const PageMeta = z.object({
  title: z.string(),
  description: z.string(),
  ogTitle: z.string(),
  ogDescription: z.string(),
  jsonLd: z.array(z.string()),
});
export type PageMeta = z.infer<typeof PageMeta>;

export const PageText = z.object({ meta: PageMeta, body: z.string() });
export type PageText = z.infer<typeof PageText>;

const term = z.string().trim().min(1).max(120);

// ---- Profile document: the export format and what profileUrl points at ----

export const ProfilePage = z.object({
  url: z.string().url(),
  path: z.string(),
  intent: z.string(),
  expected: z.array(term).max(EXPECTED_COUNT),
  included: z.boolean().default(true),
});
export type ProfilePage = z.infer<typeof ProfilePage>;

export const ProfileDocument = z.object({
  schema: z.literal("seo-jev-analyzer/profile@1"),
  name: z.string(),
  domain: z.string(),
  sitemapUrl: z.string().default(""),
  pathFilter: z.string().default(""),
  terms: z.array(term).max(MAX_TERMS),
  /** Lines removed from every page body before scoring; found with find_boilerplate. */
  boilerplate: z.array(z.string()).default([]),
  pages: z.array(ProfilePage),
});
export type ProfileDocument = z.infer<typeof ProfileDocument>;

// ---- Score result ----

export const PointsItem = z.object({ kind: z.enum(["term", "intent"]), label: z.string(), points: z.number() });
export type PointsItem = z.infer<typeof PointsItem>;

export const ScopeScore = z.object({
  score: z.number().describe("Term sum x intent fit, 0 to 10; mean over runs"),
  sd: z.number().nullable().describe("Standard deviation over runs; null for a single run"),
  termSum: z.number(),
  intentFit: z.number(),
  intentProbabilities: z.record(z.string(), z.number()),
  ratings: z.record(z.string(), z.number()).describe("Mean rating per term, 0 to 1"),
  pointsAvailable: z.array(PointsItem),
});
export type ScopeScore = z.infer<typeof ScopeScore>;

export const Verdict = z.enum(["up", "down", "level"]);
export const ScopeChange = z.object({ before: z.number(), after: z.number(), delta: z.number(), verdict: Verdict });
export type ScopeChange = z.infer<typeof ScopeChange>;

export const Comparison = z.object({
  baselineScoredAt: z.string(),
  comparable: z.boolean(),
  reason: z.string().optional(),
  noiseFloor: z.number(),
  threshold: z.number().describe("A change larger than this is up or down: noise floor x sqrt(1/runs + 1/baseline runs)"),
  scores: z.object({ meta: ScopeChange.optional(), page: ScopeChange.optional() }),
});
export type Comparison = z.infer<typeof Comparison>;

export const Inputs = z.object({
  intent: z.string().trim().min(1),
  expected: z.array(term).length(EXPECTED_COUNT).refine((xs) => new Set(xs).size === xs.length, "expected terms must not repeat"),
  terms: z.array(term).min(EXPECTED_COUNT).max(MAX_TERMS),
});
export type Inputs = z.infer<typeof Inputs>;

export const ScoreResult = z.object({
  schema: z.literal("seo-jev-analyzer/result@1"),
  page: z.string(),
  scoredAt: z.string(),
  model: z.string(),
  questionVersion: z.string(),
  fingerprint: z.string(),
  inputs: Inputs,
  text: z.object({
    source: z.enum(["url", "text"]),
    meta: PageMeta,
    bodyChars: z.number(),
    textHash: z.string(),
    warnings: z.array(z.string()),
  }),
  runs: z.number().int(),
  noiseFloor: z.number(),
  scores: z.object({ meta: ScopeScore.optional(), page: ScopeScore.optional() }),
  comparison: Comparison.optional(),
});
export type ScoreResult = z.infer<typeof ScoreResult>;

// ---- Operation inputs and outputs ----

export const ScoreRequest = z.object({
  page: z.string().optional().describe("Absolute URL, or a path resolved against the profile's domain"),
  text: PageText.optional().describe("Score this metadata and body instead of fetching the page"),
  intent: z.string().optional(),
  expected: z.array(term).optional(),
  terms: z.array(term).optional(),
  profile: ProfileDocument.optional(),
  profileUrl: z.string().url().optional().describe("URL of a profile document (an exported profile file)"),
  boilerplate: z.array(z.string()).optional().describe("Lines to remove from the body; defaults to the profile's list"),
  runs: z.number().int().min(1).max(MAX_RUNS).default(1),
  scopes: z.array(Scope).min(1).default(["meta", "page"]),
  baseline: ScoreResult.optional().describe("An earlier result to compare against"),
});
export type ScoreRequest = z.input<typeof ScoreRequest>;

export const CompareRequest = z.object({ result: ScoreResult, baseline: ScoreResult });
export const DiscoverRequest = z.object({
  domain: z.string().min(1),
  sitemapUrl: z.string().optional(),
  pathFilter: z.string().optional().describe("Keep URLs whose path starts with this; may include the host"),
});
export const DiscoverResult = z.object({ origin: z.string(), sitemapUrl: z.string(), urls: z.array(z.string()) });
export const BoilerplateRequest = z.object({ urls: z.array(z.string().url()).min(1).max(200), share: z.number().min(0.5).max(1).default(BOILERPLATE_SHARE) });
export const BoilerplateResult = z.object({ lines: z.array(z.string()), pagesRead: z.number(), share: z.number() });
export const ReadRequest = z.object({ page: z.string(), profile: ProfileDocument.optional(), profileUrl: z.string().url().optional(), boilerplate: z.array(z.string()).optional() });
export const ReadResult = z.object({
  url: z.string(), status: z.number(), source: z.string(), warnings: z.array(z.string()),
  meta: PageMeta, body: z.string(), textHash: z.string(),
});
export const MethodResult = z.object({
  model: z.string(),
  questionVersion: z.string(),
  noiseFloor: z.number().nullable().describe("null when this Jev version has no measured floor; scoring is then refused"),
  noiseFloorEvidence: z.string().nullable(),
  scale: z.string(),
  maxRuns: z.number(),
  intentLevels: z.array(z.string()),
  termLevels: z.array(z.string()),
  simulated: z.boolean(),
});
export const SelfTestResult = z.object({
  pass: z.boolean(),
  texts: z.array(z.object({ name: z.string(), pass: z.boolean(), topTerm: z.string(), target: z.string(), intentFit: z.number() })),
});
export const Empty = z.object({});
