// The scoring engine: one method per use case. Every front door (web app, HTTP, MCP) calls these and nothing else.

import { QUESTION_VERSION, INTENT_LEVELS, TERM_LEVELS } from "@/core/questions";
import { fingerprint, textHash } from "@/core/fingerprint";
import { compareResults, noiseFloorFor } from "@/core/noise";
import { parseProfile, findProfilePage, resolvePageUrl, matchesFilter, pathOf } from "@/core/profile";
import { pointsAvailable, score, stat, termSum } from "@/core/scoring";
import { inputProblems } from "@/core/inputs";
import { pool } from "@/core/pool";
import { applyBoilerplate, changedFields, findBoilerplate, revise, scoped } from "@/core/text";
import { PRACTICE } from "@/core/practice";
import {
  Inputs, MAX_RUNS, ScoreRequest as ScoreRequestSchema, RevisionRequest as RevisionRequestSchema, SCOPES, BOILERPLATE_SHARE, SELF_TEST_MIN_FIT,
  type Comparison, type PageText, type ProfileDocument, type RevisionRequest, type RevisionResult, type Scope, type ScoreRequest, type ScoreResult, type ScopeScore,
} from "@/core/schema";
import type { z } from "zod";
import type { DocumentFetcher, EngineSettings, Judge, PageReader, SiteMapper } from "./ports";

export class EngineError extends Error {
  constructor(public code: "bad_request" | "not_found" | "unsupported" | "upstream", message: string) {
    super(message);
  }
}

type ScoreRequestParsed = z.output<typeof ScoreRequestSchema>;
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
    const cur = await this.prepare(req);
    const result = await this.scoreText(cur, cur.text, cur.source, req.scopes, req.runs, this.settings.concurrency);
    if (req.baseline) result.comparison = compareResults(result, req.baseline);
    return result;
  }

  /**
   * Scores the current page and a revision of it in one call. The revision carries only the fields that change;
   * the rest come from the current page (read from page, or from text). A baseline of the same text and inputs
   * stands in for the current score, which halves the Jev requests.
   */
  async testRevision(raw: RevisionRequest): Promise<RevisionResult> {
    const req = RevisionRequestSchema.parse(raw);
    const cur = await this.prepare(req);
    const next = applyBoilerplate(revise(cur.text, req.revision), cur.boilerplate);
    const changed = changedFields(cur.text, next);
    if (!changed.length) throw new EngineError("bad_request", "The revision matches the current page; there is nothing to test");
    const scopes = req.scopes ?? (changed.some((k) => k !== "body") ? SCOPES : (["page"] as Scope[]));
    const warnings = [...cur.warnings];

    const b = req.baseline;
    const why = !b ? null
      : b.fingerprint !== fingerprint(this.judge.model, QUESTION_VERSION, cur.inputs) ? "its Jev version, question version, terms, intent or expected terms differ"
      : b.text.textHash !== textHash(cur.text) ? "the current page text has changed since it was scored"
      : !scopes.every((s) => b.scores[s]) ? `it has no ${scopes.filter((s) => !b.scores[s]).join(" or ")} score`
      : null;
    if (b && why) warnings.push(`The baseline was not used as the current score because ${why}; the current page was scored again.`);
    const useBaseline = !!b && !why;

    const half = Math.max(1, Math.floor(this.settings.concurrency / 2));
    const [current, revised] = await Promise.all([
      useBaseline ? b! : this.scoreText(cur, cur.text, cur.source, scopes, req.runs, half),
      this.scoreText(cur, next, "revision", scopes, req.runs, useBaseline ? this.settings.concurrency : half),
    ]);
    return { page: cur.page, changed, currentFrom: useBaseline ? "baseline" : "scored", warnings, current, revised, comparison: compareResults(revised, current) };
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

  /** Resolves the inputs (request, then profile, then baseline) and the current text (request text, else the page). */
  private async prepare(req: Pick<ScoreRequestParsed, "page" | "text" | "intent" | "expected" | "terms" | "profile" | "profileUrl" | "boilerplate" | "baseline">) {
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

    const boilerplate = req.boilerplate ?? profile?.boilerplate ?? [];
    if (req.text) {
      const page = req.page ? resolvePageUrl(req.page, profile?.domain) : req.baseline?.page ?? "text";
      return { floor, inputs, boilerplate, page, text: applyBoilerplate(req.text, boilerplate), source: "text" as const, warnings: [] as string[] };
    }
    const target = req.page ?? req.baseline?.page;
    if (!target) throw new EngineError("bad_request", "Give a page URL or text to score");
    const read = await this.reader.read(resolvePageUrl(target, profile?.domain));
    if (read.status >= 400) throw new EngineError("upstream", `The page returned HTTP ${read.status}`);
    return { floor, inputs, boilerplate, page: read.url, text: applyBoilerplate({ meta: read.meta, body: read.body }, boilerplate), source: "url" as const, warnings: [...read.warnings] };
  }

  /** One result for one text: each requested scope scored over n runs. */
  private async scoreText(
    cur: { floor: { floor: number }; inputs: Inputs; page: string; warnings: string[] },
    text: PageText, source: ScoreResult["text"]["source"], scopes: Scope[], runs: number, workers: number,
  ): Promise<ScoreResult> {
    const scores: ScoreResult["scores"] = {};
    for (const scope of SCOPES.filter((s) => scopes.includes(s))) scores[scope] = await this.scoreScope(text, scope, cur.inputs, runs, workers);
    return {
      schema: "seo-jev-analyzer/result@1",
      page: cur.page,
      scoredAt: new Date().toISOString(),
      model: this.judge.model,
      questionVersion: QUESTION_VERSION,
      fingerprint: fingerprint(this.judge.model, QUESTION_VERSION, cur.inputs),
      inputs: cur.inputs,
      text: { source, meta: text.meta, bodyChars: text.body.length, textHash: textHash(text), warnings: source === "url" ? cur.warnings : [] },
      runs,
      noiseFloor: cur.floor.floor,
      scores,
    };
  }


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
  private async scoreScope(text: PageText, scope: Scope, inputs: Inputs, runs: number, workers: number): Promise<ScopeScore> {
    const state = scoped(text, scope);
    const answers = await pool(Array.from({ length: runs }, (_, i) => i), workers, async (): Promise<Answer> => {
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
