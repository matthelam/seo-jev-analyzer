// What the scorer reads: metadata alone (metadata score) or metadata and body (page score),
// with the profile's boilerplate lines removed from the body.

import { BOILERPLATE_SHARE, REVISABLE, type PageText, type Revisable, type Revision, type Scope } from "./schema";

/** Body text beyond this length is cut before scoring. */
export const MAX_BODY_CHARS = 60_000;

export type JudgeState = { meta: PageText["meta"]; body?: string };

export const scoped = (text: PageText, scope: Scope): JudgeState => (scope === "meta" ? { meta: text.meta } : { meta: text.meta, body: text.body });

export function applyBoilerplate(text: PageText, lines: string[]): PageText {
  const drop = new Set(lines);
  const body = drop.size ? text.body.split("\n").filter((l) => !drop.has(l)).join("\n") : text.body;
  return { meta: text.meta, body: body.slice(0, MAX_BODY_CHARS) };
}

/** Lines that appear on at least `share` of the given bodies (shared banners, cookie notices). */
export function findBoilerplate(bodies: string[], share = BOILERPLATE_SHARE): string[] {
  if (bodies.length < 3) return [];
  const counts = new Map<string, number>();
  for (const b of bodies) for (const line of new Set(b.split("\n"))) if (line.trim()) counts.set(line, (counts.get(line) ?? 0) + 1);
  const limit = Math.ceil(bodies.length * share);
  return [...counts].filter(([, n]) => n >= limit).map(([l]) => l).sort();
}

/** The current text with a revision's fields put in; fields the revision leaves out keep their current value. */
export function revise(text: PageText, r: Revision): PageText {
  const m = text.meta;
  return {
    meta: {
      title: r.title ?? m.title,
      description: r.description ?? m.description,
      ogTitle: r.ogTitle ?? m.ogTitle,
      ogDescription: r.ogDescription ?? m.ogDescription,
      jsonLd: r.jsonLd ?? m.jsonLd,
    },
    body: r.body === undefined ? text.body : r.body.replace(/\r\n?/g, "\n"),
  };
}

/** The fields that differ between two texts, in REVISABLE order. */
export function changedFields(a: PageText, b: PageText): Revisable[] {
  const value = (t: PageText, k: Revisable) => (k === "body" ? t.body : k === "jsonLd" ? JSON.stringify(t.meta.jsonLd) : t.meta[k]);
  return REVISABLE.filter((k) => value(a, k) !== value(b, k));
}
