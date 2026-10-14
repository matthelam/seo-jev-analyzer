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
