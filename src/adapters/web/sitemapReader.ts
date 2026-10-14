// Sitemap adapter: robots.txt Sitemap lines, then /sitemap.xml; follows one level of sitemap index.

import type { SiteMapper } from "@/engine/ports";
import { normaliseDomain as toOrigin } from "@/core/profile";
import { checkUrl, safeFetch } from "./safeUrl";

export const locs = (xml: string) =>
  [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));

async function get(url: string) {
  const res = await safeFetch(url);
  return { ok: res.ok, text: res.ok ? await res.text() : "" };
}

/** Origin of a site address, refused if local or private. */
export function normaliseDomain(input: string): string {
  const origin = toOrigin(input);
  checkUrl(origin);
  return origin;
}

export class SitemapReader implements SiteMapper {
  async discover(domain: string, explicit?: string) {
    const origin = normaliseDomain(domain);
    const candidates: string[] = [];
    if (explicit) candidates.push(explicit);
    else {
      const robots = await get(`${origin}/robots.txt`).catch(() => ({ ok: false, text: "" }));
      if (robots.ok) for (const m of robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)) candidates.push(m[1]);
      candidates.push(`${origin}/sitemap.xml`);
    }
    for (const c of candidates) {
      const r = await get(c).catch(() => null);
      if (!r?.ok) continue;
      let urls = locs(r.text);
      if (/<sitemapindex/i.test(r.text)) {
        const nested: string[] = [];
        for (const child of urls.slice(0, 50)) {
          const cr = await get(child).catch(() => null);
          if (cr?.ok) nested.push(...locs(cr.text));
        }
        urls = nested;
      }
      if (urls.length) return { origin, sitemapUrl: c, urls: [...new Set(urls)].sort() };
    }
    throw new Error("No sitemap found. Give the sitemap address instead.");
  }
}
