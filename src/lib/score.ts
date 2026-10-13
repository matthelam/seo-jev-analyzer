// The single score and everything derived from it. Pure functions; no I/O.

import type { Stat } from "./types";

/** Score = (sum of the ratings of the page's expected terms) x intent fit. 0 to 10. */
export function termSum(allTerms: string[], ratings: number[], expected: string[]): number {
  return expected.reduce((s, t) => {
    const i = allTerms.indexOf(t);
    return s + (i >= 0 ? ratings[i] ?? 0 : 0);
  }, 0);
}

export function score(allTerms: string[], ratings: number[], expected: string[], intentFit: number): number {
  return termSum(allTerms, ratings, expected) * intentFit;
}

export function stat(xs: number[]): Stat {
  const n = xs.length;
  if (!n) return { mean: 0, sd: 0, n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd, n };
}

/** Half-width of the displayed band: 2 standard deviations. */
export const band = (sd: number) => 2 * sd;

/** Two scores are level when their +/- 2 SD bands overlap. */
export function level(a: number, sdA: number, b: number, sdB: number): boolean {
  return Math.abs(a - b) <= band(sdA) + band(sdB);
}

export type PointsItem = { kind: "term" | "intent"; label: string; points: number; rating?: number };

/**
 * Points available on one page: each expected term's unearned share (1 - rating)
 * and the intent discount (term sum x (1 - intent fit)). They add up to 10 - score.
 */
export function pointsAvailable(allTerms: string[], ratings: number[], expected: string[], intentFit: number): PointsItem[] {
  const items: PointsItem[] = expected.map((t) => {
    const r = ratings[allTerms.indexOf(t)] ?? 0;
    return { kind: "term", label: t, points: 1 - r, rating: r };
  });
  const sum = termSum(allTerms, ratings, expected);
  items.push({ kind: "intent", label: "Intent discount", points: sum * (1 - intentFit) });
  return items.sort((a, b) => b.points - a.points);
}

export type Level = "weak" | "fair" | "strong";
export function scoreLevel(s: number): Level {
  return s < 2 ? "weak" : s <= 3.5 ? "fair" : "strong";
}

/** Two clusters: the gap between the two halves of the sorted values exceeds 4 SD of either half. */
export function splitsIntoClusters(xs: number[]): boolean {
  if (xs.length < 10) return false;
  const s = [...xs].sort((a, b) => a - b);
  let best = 0, at = -1;
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > best) { best = s[i] - s[i - 1]; at = i; }
  const lo = stat(s.slice(0, at)), hi = stat(s.slice(at));
  if (lo.n < 3 || hi.n < 3) return false;
  return best > 4 * Math.max(lo.sd, hi.sd, 0.005);
}
