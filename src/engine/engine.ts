// The scoring engine: one method per use case. Every front door (web app, HTTP, MCP) calls these and nothing else.

import { QUESTION_VERSION, INTENT_LEVELS, TERM_LEVELS } from "@/core/questions";
import { fingerprint, textHash } from "@/core/fingerprint";
import { compareResults, noiseFloorFor } from "@/core/noise";
import { parseProfile, findProfilePage, resolvePageUrl, matchesFilter, pathOf } from "@/core/profile";
import { pointsAvailable, score, stat, termSum } from "@/core/scoring";
import { inputProblems } from "@/core/inputs";
import { pool } from "@/core/pool";
import { applyBoilerplate, findBoilerplate, scoped } from "@/core/text";
import { PRACTICE } from "@/core/practice";
import {
  Inputs, MAX_RUNS, ScoreRequest as ScoreRequestSchema, SCOPES, BOILERPLATE_SHARE, SELF_TEST_MIN_FIT,
  type Comparison, type PageText, type ProfileDocument, type Scope, type ScoreRequest, type ScoreResult, type ScopeScore,
} from "@/core/schema";
import type { DocumentFetcher, EngineSettings, Judge, PageReader, SiteMapper } from "./ports";

export class EngineError extends Error {
  constructor(public code: "bad_request" | "not_found" | "unsupported" | "upstream", message: string) {
    super(message);
  }
}

type Answer = { intent: number; probs: Record<string, number>; ratings: number[] };

export class ScoringEngine {
  constructor(
    private judge: Judge,
    private reader: PageReader,
    private mapper: SiteMapper,
    private documents: DocumentFetcher,
    private settings: EngineSettings,
  ) {}

  private floor() {
    const f = noiseFloorFor(this.judge.model, QUESTION_VERSION);
    if (!f) throw new EngineError("unsupported", `No measured noise floor for ${this.judge.model} with questions ${QUESTION_VERSION}. Measure one before scoring with this version.`);
    return f;
  }

  method() {
    const f = noiseFloorFor(this.judge.model, QUESTION_VERSION);
    return {
      model: this.judge.model,
      questionVersion: QUESTION_VERSION,
      noiseFloor: f?.floor ?? null,
      noiseFloorEvidence: f?.evidence ?? null,
      scale: "Score = sum of the 10 expected term ratings x intent fit, 0 to 10. Two scores: metadata (title, description, Open Graph, JSON-LD) and page (metadata plus main body). Each score's band is the noise floor; a change is level within noise floor x sqrt(1/runs + 1/baseline runs).",
      maxRuns: MAX_RUNS,
      intentLevels: INTENT_LEVELS,
      termLevels: TERM_LEVELS,
      simulated: this.judge.simulated,
    };
  }

  async discoverPages(input: { domain: string; sitemapUrl?: string; pathFilter?: string }) {
    const r = await this.mapper.discover(input.domain, input.sitemapUrl);
    return { ...r, urls: input.pathFilter ? r.urls.filter((u) => matchesFilter(pathOf(u), input.pathFilter!)) : r.urls };
  }

  async findBoilerplate(input: { urls: string[]; share?: number }) {
    const share = input.share ?? BOILERPLATE_SHARE;
    const pages = await pool(input.urls, this.settings.concurrency, (u) => this.reader.read(u).then((p) => (p.status < 400 ? p.body : null)).catch(() => null));
    const bodies = pages.filter((b): b is string => b !== null);
    return { lines: findBoilerplate(bodies, share), pagesRead: bodies.length, share };
  }

  async readPage(input: { page: string; profile?: ProfileDocument; profileUrl?: string; boilerplate?: string[] }) {
    const profile = await this.loadProfile(input.profile, input.profileUrl);
    const url = resolvePageUrl(input.page, profile?.domain);
    const p = await this.reader.read(url);
    if (p.status >= 400) throw new EngineError("upstream", `The page returned HTTP ${p.status}`);
    const text = applyBoilerplate({ meta: p.meta, body: p.body }, input.boilerplate ?? profile?.boilerplate ?? []);
    return { url: p.url, status: p.status, source: p.source, warnings: p.warnings, meta: text.meta, body: text.body, textHash: textHash(text) };
  }

  async scorePage(raw: ScoreRequest): Promise<ScoreResult> {
    const req = ScoreRequestSchema.parse(raw);
    const floor = this.floor();
    const profile = await this.loadProfile(req.profile, req.profileUrl);
    const entry = profile && req.page ? findProfilePage(profile, req.page) : undefined;
    const base = req.baseline?.inputs;
    const parsed = Inputs.safeParse({
      intent: req.intent ?? entry?.intent ?? base?.intent,
      expected: req.expected ?? entry?.expected ?? base?.expected,
      terms: req.terms ?? profile?.terms ?? base?.terms,
    });
    if (!parsed.success) {
      throw new EngineError("bad_request", `Missing or invalid inputs (${parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ")}). Give intent, 10 expected terms and the term list, or a profile that holds this page, or a baseline.`);
    }
    const inputs = parsed.data;
    const problems = inputProblems(inputs.terms, { label: req.page ?? "page", ...inputs });
    if (problems.length) throw new EngineError("bad_request", problems.join("; "));

    let text: PageText, page: string, source: "url" | "text", warnings: string[] = [];
    const boilerplate = req.boilerplate ?? profile?.boilerplate ?? [];
    if (req.text) {
      text = applyBoilerplate(req.text, boilerplate);
      page = req.page ? resolvePageUrl(req.page, profile?.domain) : req.baseline?.page ?? "text";
      source = "text";
    } else {
      const target = req.page ?? req.baseline?.page;
      if (!target) throw new EngineError("bad_request", "Give a page URL or text to score");
      const read = await this.reader.read(resolvePageUrl(target, profile?.domain));
      if (read.status >= 400) throw new EngineError("upstream", `The page returned HTTP ${read.status}`);
      text = applyBoilerplate({ meta: read.meta, body: read.body }, boilerplate);
      page = read.url;
      source = "url";
      warnings = read.warnings;
    }

    const scores: ScoreResult["scores"] = {};
    for (const scope of SCOPES.filter((s) => req.scopes.includes(s))) scores[scope] = await this.scoreScope(text, scope, inputs, req.runs);

    const result: ScoreResult = {
      schema: "seo-jev-analyzer/result@1",
      page,
      scoredAt: new Date().toISOString(),
      model: this.judge.model,
      questionVersion: QUESTION_VERSION,
      fingerprint: fingerprint(this.judge.model, QUESTION_VERSION, inputs),
      inputs,
      text: { source, meta: text.meta, bodyChars: text.body.length, textHash: textHash(text), warnings },
      runs: req.runs,
      noiseFloor: floor.floor,
      scores,
    };
    if (req.baseline) result.comparison = compareResults(result, req.baseline);
    return result;
  }

  compareResults(input: { result: ScoreResult; baseline: ScoreResult }): Comparison {
    return compareResults(input.result, input.baseline);
  }

  async selfTest() {
    const texts = await pool(PRACTICE, this.settings.concurrency, async (p) => {
      const state = scoped({ meta: p.meta, body: p.body }, "page");
      const [a, t] = await Promise.all([this.judge.intentFit(state, p.intent), this.judge.termRatings(state, p.terms)]);
      const top = p.terms[t.ratings.indexOf(Math.max(...t.ratings))];
      return { name: p.name, target: p.target, topTerm: top, intentFit: a.score, pass: top === p.target && a.score >= SELF_TEST_MIN_FIT };
    });
    return { pass: texts.every((x) => x.pass), texts };
  }

  // ---- internals ----

  private async loadProfile(profile?: ProfileDocument, url?: string): Promise<ProfileDocument | undefined> {
    if (profile) return profile;
    if (!url) return undefined;
    try {
      return parseProfile(await this.documents.getJson(url));
    } catch (e: any) {
      throw new EngineError("bad_request", `Could not read the profile at ${url}: ${e.message}`);
    }
  }

  /**
   * One scope, n runs. Ratings and intent fit are averaged over runs; the score, term sum and points available
   * all derive from those averages, so they agree (points add up to 10 - score). The SD is of the per-run scores.
   */
  private async scoreScope(text: PageText, scope: Scope, inputs: Inputs, runs: number): Promise<ScopeScore> {
    const state = scoped(text, scope);
    const answers = await pool(Array.from({ length: runs }, (_, i) => i), this.settings.concurrency, async (): Promise<Answer> => {
      const [a, t] = await Promise.all([this.judge.intentFit(state, inputs.intent), this.judge.termRatings(state, inputs.terms)]);
      return { intent: a.score, probs: a.probabilities, ratings: t.ratings };
    });
    const ratings = inputs.terms.map((_, i) => stat(answers.map((a) => a.ratings[i])).mean);
    const intentFit = stat(answers.map((a) => a.intent)).mean;
    const probs: Record<string, number> = {};
    for (const a of answers) for (const [k, v] of Object.entries(a.probs)) probs[k] = (probs[k] ?? 0) + v / answers.length;
    const perRun = answers.map((a) => score(inputs.terms, a.ratings, inputs.expected, a.intent));
    return {
      score: score(inputs.terms, ratings, inputs.expected, intentFit),
      sd: runs > 1 ? stat(perRun).sd : null,
      termSum: termSum(inputs.terms, ratings, inputs.expected),
      intentFit,
      intentProbabilities: probs,
      ratings: Object.fromEntries(inputs.terms.map((t, i) => [t, ratings[i]])),
      pointsAvailable: pointsAvailable(inputs.terms, ratings, inputs.expected, intentFit),
    };
  }
}
