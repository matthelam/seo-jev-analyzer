// The single score and everything derived from it. Pure functions.

import type { PointsItem } from "./schema";

export type Stat = { mean: number; sd: number; n: number };

/** Sum of the ratings of the page's expected terms, 0 to 10. */
export function termSum(allTerms: string[], ratings: number[], expected: string[]): number {
  return expected.reduce((s, t) => {
    const i = allTerms.indexOf(t);
    return s + (i >= 0 ? ratings[i] ?? 0 : 0);
  }, 0);
}

/** Score = term sum x intent fit, 0 to 10. */
export const score = (allTerms: string[], ratings: number[], expected: string[], intentFit: number) =>
  termSum(allTerms, ratings, expected) * intentFit;

export function stat(xs: number[]): Stat {
  const n = xs.length;
  if (!n) return { mean: 0, sd: 0, n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd, n };
}

/**
 * Points available on one page: each expected term's unearned share (1 - rating)
 * and the intent discount (term sum x (1 - intent fit)). They add up to 10 - score(ratings, intent fit).
 */
export function pointsAvailable(allTerms: string[], ratings: number[], expected: string[], intentFit: number): PointsItem[] {
  const items: PointsItem[] = expected.map((t) => ({ kind: "term" as const, label: t, points: 1 - (ratings[allTerms.indexOf(t)] ?? 0) }));
  items.push({ kind: "intent", label: "Intent discount", points: termSum(allTerms, ratings, expected) * (1 - intentFit) });
  return items.sort((a, b) => b.points - a.points);
}

export type Level = "weak" | "fair" | "strong";
export const scoreLevel = (s: number): Level => (s < 2 ? "weak" : s <= 3.5 ? "fair" : "strong");
