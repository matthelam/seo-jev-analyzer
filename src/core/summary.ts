// Profile-level figures derived from a set of page results.

import { SCOPES, type ScoreResult, type Scope } from "./schema";
import { floorOfMean } from "./noise";

/** Mean page score per scope; a scope with no scores is absent. */
export function profileScore(results: ScoreResult[]): Partial<Record<Scope, number>> {
  const out: Partial<Record<Scope, number>> = {};
  for (const s of SCOPES) {
    const xs = results.map((r) => r.scores[s]?.score).filter((x): x is number => x !== undefined);
    if (xs.length) out[s] = xs.reduce((a, b) => a + b, 0) / xs.length;
  }
  return out;
}

/** Band of the profile score: the results' noise floor narrowed for a mean of n pages. */
export function profileBand(results: ScoreResult[]): number | undefined {
  if (!results.length) return undefined;
  return floorOfMean(Math.max(...results.map((r) => r.noiseFloor)), results.length);
}

/** Points still available across pages for one scope: the sum of each page's points available. */
export const pointsRemaining = (results: ScoreResult[], scope: Scope) =>
  results.reduce((s, r) => s + (r.scores[scope]?.pointsAvailable.reduce((a, p) => a + p.points, 0) ?? 0), 0);
