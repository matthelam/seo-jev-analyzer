import { describe, expect, it } from "vitest";
import { filterToPath, matchesFilter } from "@/lib/filter";
import { removeRepeatedLines } from "@/lib/sitepass";
import { fingerprintInput } from "@/lib/fingerprint";
import { validate } from "@/lib/io";
import { locs } from "@/lib/server/sitemap";
import { extractFromHtml } from "@/extract";
import example from "../public/examples/boulderfest.json";

describe("page filter", () => {
  it("accepts a path, a bare word or a full address", () => {
    expect(filterToPath("/climb")).toBe("/climb");
    expect(filterToPath("climb")).toBe("/climb");
    expect(filterToPath("boulderfest.com.au/course")).toBe("/course");
    expect(filterToPath("https://example.com/courses")).toBe("/courses");
  });
  it("keeps the page, its sub-pages and siblings sharing the prefix", () => {
    const paths = ["/courses", "/courses/beginner", "/course-payments", "/climb"];
    expect(paths.filter((p) => matchesFilter(p, "example.com/course"))).toEqual(["/courses", "/courses/beginner", "/course-payments"]);
    expect(paths.filter((p) => matchesFilter(p, ""))).toHaveLength(4);
  });
});

describe("site pass", () => {
  it("drops lines on 80% or more of pages", () => {
    const out = removeRepeatedLines(["x", "y", "z"].map((u) => ({ body: `Page ${u}\nBook today` })));
    expect(out.map((p) => p.body)).toEqual(["Page x", "Page y", "Page z"]);
  });
});

describe("fingerprint", () => {
  const profile: any = { terms: ["a", "b"] };
  const pages: any[] = [{ url: "https://x/1", intent: "q", expected: ["a"], included: true }, { url: "https://x/2", intent: "r", expected: ["b"], included: false }];
  it("changes with terms, intents, model and question wording, not with excluded pages", () => {
    const base = fingerprintInput(profile, pages, "jev-1.13.0", "q1");
    expect(fingerprintInput({ terms: ["a", "c"] } as any, pages, "jev-1.13.0", "q1")).not.toBe(base);
    expect(fingerprintInput(profile, [{ ...pages[0], intent: "z" }, pages[1]], "jev-1.13.0", "q1")).not.toBe(base);
    expect(fingerprintInput(profile, pages, "jev-1.14.0", "q1")).not.toBe(base);
    expect(fingerprintInput(profile, pages, "jev-1.13.0", "q2")).not.toBe(base);
    expect(fingerprintInput(profile, [pages[0], { ...pages[1], intent: "changed" }], "jev-1.13.0", "q1")).toBe(base);
  });
});

describe("example profile", () => {
  it("is valid: 18 pages, 60 terms, every page has an intent and 10 known expected terms", () => {
    validate(example);
    expect(example.pages).toHaveLength(18);
    expect(example.profile.terms).toHaveLength(60);
    for (const p of example.pages) {
      expect(p.intent.length).toBeGreaterThan(10);
      expect(p.expected).toHaveLength(10);
      for (const t of p.expected) expect(example.profile.terms).toContain(t);
    }
  });
  it("rejects files from other apps or versions", () => {
    expect(() => validate({ app: "other" })).toThrow();
    expect(() => validate({ ...example, schemaVersion: 99 })).toThrow();
  });
});

describe("sitemap parsing", () => {
  it("reads loc entries, including CDATA and escaped ampersands", () => {
    const xml = `<urlset><url><loc>https://x.test/a</loc></url><url><loc><![CDATA[https://x.test/b?x=1&amp;y=2]]></loc></url></urlset>`;
    expect(locs(xml)).toEqual(["https://x.test/a", "https://x.test/b?x=1&y=2"]);
  });
});

describe("extractor", () => {
  it("resolves streamed sections and drops chrome", () => {
    const html = `<html><head><title>T</title><meta name="description" content="D"></head><body><header>Nav</header><main><!--$?--><template id="B:0"></template><h4>Loading component...</h4><!--/$--></main><footer>F</footer><div hidden id="S:0"><h1>Real</h1><p>Body text</p></div><script>$RC("B:0","S:0")</script></body></html>`;
    const r = extractFromHtml("x", html);
    expect(r.body).toBe("Real\nBody text");
    expect(r.meta).toMatchObject({ title: "T", description: "D" });
  });
});
