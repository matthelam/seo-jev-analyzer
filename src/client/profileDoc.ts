// Converts between the browser's stored profile and the profile document the engine reads.

import type { ProfileDocument } from "@/core/schema";
import { inputProblems } from "@/core/inputs";
import type { Page, Profile } from "./types";

export function toProfileDocument(profile: Profile, pages: Page[]): ProfileDocument {
  return {
    schema: "seo-jev-analyzer/profile@1",
    name: profile.name,
    domain: profile.domain,
    sitemapUrl: profile.sitemapUrl,
    pathFilter: profile.pathFilter,
    terms: profile.terms,
    boilerplate: profile.boilerplate ?? [],
    pages: [...pages].sort((a, b) => a.path.localeCompare(b.path)).map((p) => ({ url: p.url, path: p.path, intent: p.intent, expected: p.expected, included: p.included })),
  };
}

/** A page is ready to score when it has an intent statement and 10 expected terms from the term list. */
export const pageProblems = (profile: Pick<Profile, "terms">, page: Pick<Page, "path" | "intent" | "expected">) =>
  inputProblems(profile.terms, { label: page.path, intent: page.intent, expected: page.expected });
