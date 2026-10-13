// Page text extractor for seo-jev-analyzer.
// Input: a URL. Output: { meta, body, source } where body excludes site chrome
// (navigation, header, footer, sidebars) and non-visible content.
// Uses an HTML parser (cheerio), not regular expressions, so attribute order,
// quoting, nesting, comments and self-closing tags do not break it.

import * as cheerio from "cheerio";

export type PageMeta = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  jsonLd: string[]; // text values found in application/ld+json blocks
};

export type ExtractedPage = {
  url: string;
  status: number;
  meta: PageMeta;
  body: string;
  source: "main" | "role-main" | "body-minus-chrome"; // which rule found the body
  warnings: string[];
};

// Never visible to a reader, so never scored.
const INVISIBLE = "script, style, noscript, template, svg, iframe, object, canvas, [hidden], [aria-hidden='true']";

// Site chrome: landmark elements and their ARIA equivalents.
const CHROME =
  "header, nav, footer, aside, [role='banner'], [role='navigation'], [role='contentinfo'], [role='complementary'], [role='search']";

// Elements that start a new line of text when flattened.
const BLOCK =
  "p, div, section, article, li, ul, ol, h1, h2, h3, h4, h5, h6, br, tr, td, th, dt, dd, blockquote, figcaption, summary, details";

function clean(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function jsonLdText(node: unknown, out: string[]): void {
  if (typeof node === "string") {
    const v = clean(node);
    if (v && !/^https?:\/\//i.test(v) && !v.startsWith("@")) out.push(v);
  } else if (Array.isArray(node)) {
    node.forEach((n) => jsonLdText(n, out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "@context" || k === "@id") continue;
      jsonLdText(v, out);
    }
  }
}

// React streaming SSR (Next.js App Router and similar) sends Suspense fallbacks in place,
// then the real content as hidden <div id="S:n"> blocks swapped in by $RC("B:x","S:y") calls.
// A browser runs that swap; this function does the same on the parsed document.
function resolveStreamedBoundaries($: cheerio.CheerioAPI, warnings: string[]): number {
  const pairs = new Map<string, string>();
  $("script").each((_, el) => {
    for (const m of $(el).text().matchAll(/\$RC\(\s*"(B:[^"]+)"\s*,\s*"(S:[^"]+)"/g)) pairs.set(m[1], m[2]);
  });
  let swapped = 0;
  for (let pass = 0; pass < 10; pass++) {
    const pending = $("template[id^='B:']").toArray().filter((t) => pairs.has(t.attribs.id));
    if (!pending.length) break;
    for (const t of pending) {
      const segment = $(`div[id='${pairs.get(t.attribs.id)}']`).first();
      if (!segment.length) continue;
      // Remove the fallback: siblings after the template up to the boundary's closing comment.
      let next = t.nextSibling;
      while (next && !(next.type === "comment" && (next as any).data === "/$")) {
        const after = next.nextSibling;
        $(next).remove();
        next = after;
      }
      $(t).replaceWith(segment.contents());
      segment.remove();
      swapped++;
    }
  }
  const left = $("template[id^='B:']").length;
  if (left) warnings.push(`${left} streamed section(s) could not be resolved`);
  return swapped;
}

export function extractFromHtml(url: string, html: string, status = 200): ExtractedPage {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  resolveStreamedBoundaries($, warnings);

  const metaContent = (sel: string) => clean($(sel).first().attr("content"));
  const jsonLd: string[] = [];
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      jsonLdText(JSON.parse($(el).text()), jsonLd);
    } catch {
      warnings.push("Unparseable JSON-LD block skipped");
    }
  });

  const meta: PageMeta = {
    title: clean($("head title").first().text()),
    description: metaContent("meta[name='description' i]"),
    ogTitle: metaContent("meta[property='og:title' i]"),
    ogDescription: metaContent("meta[property='og:description' i]"),
    jsonLd,
  };

  // Body rule order: <main>, then role="main", then <body> with chrome removed.
  let root = $("main").first();
  let source: ExtractedPage["source"] = "main";
  if ($("main").length > 1) warnings.push("More than one <main>; first used");
  if (!root.length) {
    root = $("[role='main']").first();
    source = "role-main";
  }
  if (!root.length) {
    root = $("body").first();
    source = "body-minus-chrome";
    warnings.push("No <main> landmark; body used with header, nav, footer and aside removed");
  }

  root.find(INVISIBLE).remove();
  // Chrome is removed in every case: a <nav> inside <main> (breadcrumbs, tabs) is still navigation.
  root.find(CHROME).remove();
  root.find(BLOCK).each((_, el) => {
    $(el).prepend("\n").append("\n");
  });

  const body = root
    .text()
    .split("\n")
    .map(clean)
    .filter(Boolean)
    .join("\n");

  if (!body) warnings.push("Empty body text");
  return { url, status, meta, body, source, warnings };
}

export async function extractPage(url: string): Promise<ExtractedPage> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "seo-jev-analyzer/0.1 (+https://github.com/matthelam/seo-jev-analyzer)", Accept: "text/html" },
  });
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("html")) throw new Error(`Not HTML (${type}) at ${url}`);
  return extractFromHtml(res.url, await res.text(), res.status);
}

// Site-level pass: drop lines that appear on most pages (shared CTA banners,
// cookie notices) because they inflate the same terms on every page.
export function removeRepeatedLines(pages: ExtractedPage[], share = 0.8): ExtractedPage[] {
  if (pages.length < 3) return pages;
  const counts = new Map<string, number>();
  for (const p of pages) for (const line of new Set(p.body.split("\n"))) counts.set(line, (counts.get(line) ?? 0) + 1);
  const limit = Math.ceil(pages.length * share);
  return pages.map((p) => ({
    ...p,
    body: p.body
      .split("\n")
      .filter((l) => (counts.get(l) ?? 0) < limit)
      .join("\n"),
  }));
}

// CLI: npx tsx src/extract.ts <url>
if (process.argv[1]?.endsWith("extract.ts") && process.argv[2]) {
  extractPage(process.argv[2]).then((p) => console.log(JSON.stringify(p, null, 2)));
}
