import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { sha256, canonical } from "@/core/hash";
import { fingerprint } from "@/core/fingerprint";
import { compareResults, noiseFloorFor, verdict, floorOfMean, changeThreshold } from "@/core/noise";
import { applyBoilerplate, findBoilerplate } from "@/core/text";
import { filterToPath, matchesFilter, findProfilePage, parseProfile, resolvePageUrl } from "@/core/profile";
import { Inputs, ScoreResult } from "@/core/schema";
import { locs } from "@/adapters/web/sitemapReader";
import { apiKeys, bearerName } from "@/server/auth";
import { extractFromHtml } from "@/adapters/web/htmlReader";
import example from "../public/examples/boulderfest.json";

describe("hash", () => {
  it("matches Node's SHA-256", () => {
    for (const s of ["", "abc", "Ünïcødé ✓", "x".repeat(1000)]) expect(sha256(s)).toBe(createHash("sha256").update(s).digest("hex"));
  });
  it("canonical JSON ignores key order", () => {
    expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
});

describe("fingerprint", () => {
  const inputs = { intent: "q", expected: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], terms: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"] };
  const base = fingerprint("jev-1.13.0", "q1", inputs);
  it("changes with model, question version, terms, intent and expected order", () => {
    expect(fingerprint("jev-1.14.0", "q1", inputs)).not.toBe(base);
    expect(fingerprint("jev-1.13.0", "q2", inputs)).not.toBe(base);
    expect(fingerprint("jev-1.13.0", "q1", { ...inputs, terms: [...inputs.terms, "z"] })).not.toBe(base);
    expect(fingerprint("jev-1.13.0", "q1", { ...inputs, intent: "r" })).not.toBe(base);
    expect(fingerprint("jev-1.13.0", "q1", { ...inputs, expected: [...inputs.expected].reverse() })).not.toBe(base);
  });
  it("intent is trimmed once, by the input schema, so the fingerprint and Jev see the same text", () => {
    expect(fingerprint("jev-1.13.0", "q1", Inputs.parse({ ...inputs, intent: " q " }))).toBe(base);
    expect(() => Inputs.parse({ ...inputs, expected: [...inputs.expected.slice(0, 9), "a"] })).toThrow();
  });
});

describe("noise floor", () => {
  it("is published for jev-1.13.0 with q1 and refused otherwise", () => {
    expect(noiseFloorFor("jev-1.13.0", "q1")?.floor).toBe(0.194);
    expect(noiseFloorFor("jev-9.9.9", "q1")).toBeNull();
  });
  it("calls changes within the floor level", () => {
    expect(verdict(0.19, 0.19)).toBe("level");
    expect(verdict(0.2, 0.19)).toBe("up");
    expect(verdict(-0.5, 0.19)).toBe("down");
    expect(floorOfMean(0.19, 4)).toBeCloseTo(0.095);
  });
  const result = (score: number, fp = "f"): ScoreResult => ScoreResult.parse({
    schema: "seo-jev-analyzer/result@1", page: "https://x.test/a", scoredAt: "2026-10-14T00:00:00Z", model: "jev-1.13.0", questionVersion: "q1", fingerprint: fp,
    inputs: { intent: "q", expected: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], terms: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] },
    text: { source: "text", meta: { title: "", description: "", ogTitle: "", ogDescription: "", jsonLd: [] }, bodyChars: 0, textHash: "t", warnings: [] },
    runs: 1, noiseFloor: 0.19,
    scores: { meta: { score, sd: null, termSum: score, intentFit: 1, intentProbabilities: {}, ratings: {}, pointsAvailable: [] } },
  });
  it("the change threshold carries both scores' noise: floor x sqrt(1/nA + 1/nB)", () => {
    expect(changeThreshold(0.194, 1, 1)).toBeCloseTo(0.274, 3);
    expect(changeThreshold(0.194, 10, 10)).toBeCloseTo(0.0868, 3);
  });
  it("compares same-fingerprint results and refuses different ones", () => {
    expect(compareResults(result(1.45), result(1.2)).scores.meta!.verdict).toBe("level");
    const c = compareResults(result(3.4), result(1.2));
    expect(c.comparable).toBe(true);
    expect(c.scores.meta).toMatchObject({ verdict: "up" });
    expect(c.scores.meta!.delta).toBeCloseTo(2.2);
    expect(compareResults(result(1.25), result(1.2)).scores.meta!.verdict).toBe("level");
    expect(compareResults(result(3), result(1, "other")).comparable).toBe(false);
  });
});

describe("boilerplate", () => {
  it("finds lines on 80% or more of pages and removes them", () => {
    const lines = findBoilerplate(["Page x\nBook today", "Page y\nBook today", "Page z\nBook today"]);
    expect(lines).toEqual(["Book today"]);
    const meta = { title: "", description: "", ogTitle: "", ogDescription: "", jsonLd: [] };
    expect(applyBoilerplate({ meta, body: "Page x\nBook today" }, lines).body).toBe("Page x");
  });
  it("needs at least three pages", () => expect(findBoilerplate(["a", "a"])).toEqual([]));
});

describe("profile", () => {
  it("path filter accepts a path, a bare word or a full address", () => {
    expect(filterToPath("/climb")).toBe("/climb");
    expect(filterToPath("climb")).toBe("/climb");
    expect(filterToPath("boulderfest.com.au/course")).toBe("/course");
    const paths = ["/courses", "/courses/beginner", "/course-payments", "/climb"];
    expect(paths.filter((p) => matchesFilter(p, "example.com/course"))).toEqual(["/courses", "/courses/beginner", "/course-payments"]);
  });
  it("reads the example and finds a page by path or URL", () => {
    const doc = parseProfile(example);
    expect(doc.pages).toHaveLength(18);
    expect(doc.terms).toHaveLength(60);
    for (const p of doc.pages) {
      expect(p.expected).toHaveLength(10);
      for (const t of p.expected) expect(doc.terms).toContain(t);
    }
    const casual = findProfilePage(doc, "/climb/casual-entry");
    expect(casual?.intent.length).toBeGreaterThan(10);
    expect(findProfilePage(doc, resolvePageUrl("/climb/casual-entry/", doc.domain))?.url).toBe(casual?.url);
  });
  it("rejects files from other apps", () => expect(() => parseProfile({ app: "other" })).toThrow());
});

describe("adapters", () => {
  it("sitemap: reads loc entries, including CDATA and escaped ampersands", () => {
    const xml = `<urlset><url><loc>https://x.test/a</loc></url><url><loc><![CDATA[https://x.test/b?x=1&amp;y=2]]></loc></url></urlset>`;
    expect(locs(xml)).toEqual(["https://x.test/a", "https://x.test/b?x=1&y=2"]);
  });
  it("page reader: resolves streamed sections and drops chrome", () => {
    const html = `<html><head><title>T</title><meta name="description" content="D"></head><body><header>Nav</header><main><!--$?--><template id="B:0"></template><h4>Loading component...</h4><!--/$--></main><footer>F</footer><div hidden id="S:0"><h1>Real</h1><p>Body text</p></div><script>$RC("B:0","S:0")</script></body></html>`;
    const r = extractFromHtml("x", html);
    expect(r.body).toBe("Real\nBody text");
    expect(r.meta).toMatchObject({ title: "T", description: "D" });
  });
});

describe("API keys", () => {
  it("one key, or named keys; short keys ignored; the caller is named", () => {
    expect(apiKeys("abcdefghijklmnop")).toEqual([{ name: "default", key: "abcdefghijklmnop" }]);
    expect(apiKeys("studio:aaaaaaaaaaaaaaaa, claude:bbbbbbbbbbbbbbbb, x:short")).toEqual([
      { name: "studio", key: "aaaaaaaaaaaaaaaa" }, { name: "claude", key: "bbbbbbbbbbbbbbbb" },
    ]);
    process.env.MCP_API_KEY = "studio:aaaaaaaaaaaaaaaa,claude:bbbbbbbbbbbbbbbb";
    expect(bearerName("Bearer bbbbbbbbbbbbbbbb")).toBe("claude");
    expect(bearerName("Bearer cccccccccccccccc")).toBeNull();
    expect(bearerName(null)).toBeNull();
    delete process.env.MCP_API_KEY;
  });
});
