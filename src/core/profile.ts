// The profile document: a site's terms, boilerplate and pages with their intent and expected terms.
// The app exports it; score_page reads it inline or from profileUrl.

import { InputError } from "./inputs";
import { ProfileDocument, type ProfilePage } from "./schema";

/** Accepts a profile document, or an app export file that contains one. */
export function parseProfile(data: unknown): ProfileDocument {
  const d = data as any;
  if (d?.schema === "seo-jev-analyzer/profile@1") return ProfileDocument.parse(d);
  if (d?.app === "seo-jev-analyzer" && d.profile?.schema === "seo-jev-analyzer/profile@1") return ProfileDocument.parse(d.profile);
  if (d?.app === "seo-jev-analyzer" && d.schemaVersion === 1) return fromV1(d);
  throw new InputError("Not a seo-jev-analyzer profile document");
}

/** Converts a version 1 export file (with calibrations) to a profile document. */
export function fromV1(d: any): ProfileDocument {
  return ProfileDocument.parse({
    schema: "seo-jev-analyzer/profile@1",
    name: d.profile.name,
    domain: d.profile.domain,
    sitemapUrl: d.profile.sitemapUrl ?? "",
    pathFilter: d.profile.pathFilter ?? "",
    terms: d.profile.terms,
    boilerplate: [],
    pages: d.pages.map((p: any) => ({ url: p.url, path: p.path, intent: p.intent ?? "", expected: p.expected ?? [], included: p.included ?? true })),
  });
}

export const pathOf = (url: string) => {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
};

/** "example.com", "https://example.com/x" or "http://host:3000" to an origin such as "https://example.com". */
export function normaliseDomain(input: string): string {
  const t = input.trim();
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    throw new InputError(`Not a valid site address: ${input}`);
  }
}

/** Resolves a page given as an absolute URL or a path against the profile's domain. */
export function resolvePageUrl(page: string, domain?: string): string {
  if (/^https?:\/\//i.test(page)) return page;
  if (!domain) throw new InputError("A relative page path needs a profile with a domain");
  return new URL(page.startsWith("/") ? page : `/${page}`, normaliseDomain(domain) + "/").toString();
}

const norm = (u: string) => u.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

export function findProfilePage(profile: ProfileDocument, page: string): ProfilePage | undefined {
  const url = norm(resolvePageUrl(page, profile.domain));
  return profile.pages.find((p) => norm(p.url) === url) ?? profile.pages.find((p) => norm(p.path) === norm(page));
}

// Page filter: accepts "/climb", "climb" or a full address such as "example.com/climb"; only the path counts.
// Every page whose path starts with the result is kept.
export function filterToPath(filter: string): string {
  const f = filter.trim();
  if (!f) return "";
  if (f.startsWith("/")) return f;
  if (!/[./]/.test(f)) return `/${f}`;
  try {
    return new URL(/^https?:\/\//.test(f) ? f : `https://${f}`).pathname;
  } catch {
    return f;
  }
}

export const matchesFilter = (path: string, filter: string) => {
  const p = filterToPath(filter);
  return !p || path.startsWith(p);
};
