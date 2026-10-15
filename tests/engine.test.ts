import { describe, expect, it } from "vitest";
import { ScoringEngine } from "@/engine/engine";
import type { Judge, PageReader } from "@/engine/ports";
import { profileScore, pointsRemaining } from "@/core/summary";
import { compareResults } from "@/core/noise";

const TERMS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
const META = { title: "T", description: "", ogTitle: "", ogDescription: "", jsonLd: [] };

/** A judge whose answers vary run to run in a known way. */
class SequenceJudge implements Judge {
  readonly model = "jev-1.13.0";
  readonly simulated = false;
  private n = 0;
  async intentFit() { return { score: [0.5, 0.7, 0.6][this.n++ % 3], probabilities: { "2": 1 }, model: this.model }; }
  async termRatings(_: unknown, terms: string[]) { return { ratings: terms.map((_, i) => (i % 4) / 4), model: this.model }; }
}
const reader: PageReader = { read: async (url) => ({ url, status: url.endsWith("/gone") ? 404 : 200, meta: META, body: "Body\nShared", source: "main", warnings: [] }) };
const none = { discover: async () => ({ origin: "", sitemapUrl: "", urls: [] }) };
const docs = { getJson: async () => ({}) };
const engine = (judge: Judge = new SequenceJudge()) => new ScoringEngine(judge, reader, none, docs, { concurrency: 3 });
const REQ = { page: "https://x.test/a", intent: "q", expected: TERMS.slice(0, 10), terms: TERMS, boilerplate: ["Shared"] };

describe("engine", () => {
  it("with several runs, score, term sum, intent fit and points available agree; SD is of the per-run scores", async () => {
    const r = await engine().scorePage({ ...REQ, runs: 3, scopes: ["meta"] });
    const m = r.scores.meta!;
    expect(m.score).toBeCloseTo(m.termSum * m.intentFit);
    expect(m.pointsAvailable.reduce((s, p) => s + p.points, 0)).toBeCloseTo(10 - m.score);
    expect(m.intentFit).toBeCloseTo(0.6);
    expect(m.sd).toBeGreaterThan(0);
    expect(r.text.bodyChars).toBe("Body".length);
  });
  it("refuses an error page, missing inputs and repeated expected terms", async () => {
    await expect(engine().scorePage({ ...REQ, page: "https://x.test/gone" })).rejects.toThrow("HTTP 404");
    await expect(engine().scorePage({ page: "https://x.test/a" })).rejects.toThrow("Missing or invalid inputs");
    await expect(engine().scorePage({ ...REQ, expected: [...TERMS.slice(0, 9), "a"] })).rejects.toThrow();
  });
  it("refuses a Jev version with no measured noise floor", async () => {
    const j = new SequenceJudge();
    (j as any).model = "jev-9.9.9";
    await expect(engine(j).scorePage(REQ)).rejects.toThrow("No measured noise floor");
    expect(engine(j).method().noiseFloor).toBeNull();
  });
  it("a baseline supplies the inputs; results for different pages do not compare", async () => {
    const a = await engine().scorePage(REQ);
    const b = await engine().scorePage({ baseline: a });
    expect(b.comparison?.comparable).toBe(true);
    const other = await engine().scorePage({ ...REQ, page: "https://x.test/b" });
    expect(compareResults(other, a)).toMatchObject({ comparable: false, reason: "Different pages" });
  });
  it("profile summary: mean per scope, absent scopes stay absent, points add up", async () => {
    const a = await engine().scorePage({ ...REQ, scopes: ["meta"] });
    const b = await engine().scorePage({ ...REQ, page: "https://x.test/b", scopes: ["meta"] });
    const s = profileScore([a, b]);
    expect(s.meta).toBeCloseTo((a.scores.meta!.score + b.scores.meta!.score) / 2);
    expect(s.page).toBeUndefined();
    expect(pointsRemaining([a, b], "meta")).toBeCloseTo(20 - a.scores.meta!.score - b.scores.meta!.score);
  });
});

describe("test_revision", () => {
  it("merges only the changed fields over the live page and compares revised with current", async () => {
    const r = await engine().testRevision({ ...REQ, revision: { title: "New title" } });
    expect(r.changed).toEqual(["title"]);
    expect(r.currentFrom).toBe("scored");
    expect(r.current.text).toMatchObject({ source: "url", meta: { title: "T" } });
    expect(r.revised.text).toMatchObject({ source: "revision", meta: { title: "New title" }, bodyChars: "Body".length });
    expect(r.revised.fingerprint).toBe(r.current.fingerprint);
    expect(r.comparison.comparable).toBe(true);
    expect(Object.keys(r.comparison.scores).sort()).toEqual(["meta", "page"]);
  });
  it("a body-only revision scores the page score only, and removes boilerplate from the revised body", async () => {
    const r = await engine().testRevision({ ...REQ, revision: { body: "Body\r\nMore\r\nShared" } });
    expect(r.changed).toEqual(["body"]);
    expect(r.revised.scores.meta).toBeUndefined();
    expect(r.revised.text.bodyChars).toBe("Body\nMore".length);
    expect(Object.keys(r.comparison.scores)).toEqual(["page"]);
  });
  it("refuses a revision that changes nothing", async () => {
    await expect(engine().testRevision({ ...REQ, revision: { title: "T", body: "Body\nShared" } })).rejects.toThrow("nothing to test");
  });
  it("reuses a matching baseline as the current score and scores only the revision", async () => {
    const judge = new SequenceJudge();
    const calls = { n: 0 };
    const counting: Judge = { model: judge.model, simulated: false, intentFit: (...a) => (calls.n++, judge.intentFit()), termRatings: (s, t) => (calls.n++, judge.termRatings(s, t)) };
    const e = engine(counting);
    const base = await e.scorePage(REQ);
    calls.n = 0;
    const r = await e.testRevision({ page: REQ.page, boilerplate: REQ.boilerplate, baseline: base, revision: { description: "New" } });
    expect(r.currentFrom).toBe("baseline");
    expect(r.current).toEqual(base);
    expect(calls.n).toBe(4);
    expect(r.warnings).toEqual([]);
  });
  it("scores the current page again when the baseline's text no longer matches", async () => {
    const base = await engine().scorePage({ ...REQ, boilerplate: [] });
    const r = await engine().testRevision({ ...REQ, baseline: base, revision: { title: "New" } });
    expect(r.currentFrom).toBe("scored");
    expect(r.warnings[0]).toContain("current page text has changed");
  });
  it("uses text as the current content for an unpublished page", async () => {
    const r = await engine().testRevision({ ...REQ, page: undefined, text: { meta: META, body: "Draft" }, revision: { body: "Draft two" } });
    expect(r.current.text.source).toBe("text");
    expect(r.revised.text.bodyChars).toBe("Draft two".length);
  });
});
