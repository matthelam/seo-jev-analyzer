// The noise floor replaces per-profile calibration: one measured value per Jev version and question version.
// The floor is the band of one single-run score: 2 x the largest SD measured. Evidence: the Jev Consistency Report.
// A change between two scores carries the noise of both, so its threshold is floor x sqrt(1/nA + 1/nB):
// 0.274 between two single runs, narrower when either score averages several runs.

import { SCOPES, type Comparison, type ScoreResult, type ScopeChange } from "./schema";

export const NOISE_FLOORS: Record<string, { floor: number; evidence: string }> = {
  // 2 x the largest score SD over 10 pages x 2 scores x 100 runs (largest SD 0.097), 14 October 2026.
  "jev-1.13.0|q1": { floor: 0.194, evidence: "/guide/jev-consistency-report" },
};

export function noiseFloorFor(model: string, questionVersion: string) {
  return NOISE_FLOORS[`${model}|${questionVersion}`] ?? null;
}

export function verdict(delta: number, floor: number): ScopeChange["verdict"] {
  return Math.abs(delta) <= floor ? "level" : delta > 0 ? "up" : "down";
}

/** Smallest change that counts as up or down between two scores averaging nA and nB runs. */
export const changeThreshold = (floor: number, nA: number, nB: number) => floor * Math.sqrt(1 / nA + 1 / nB);

/** Compares a result with an earlier one of the same page. Pure; no Jev requests. */
export function compareResults(after: ScoreResult, before: ScoreResult): Comparison {
  const floor = Math.max(after.noiseFloor, before.noiseFloor);
  const threshold = changeThreshold(floor, after.runs, before.runs);
  const base = { baselineScoredAt: before.scoredAt, noiseFloor: floor, threshold, scores: {} as Comparison["scores"] };
  const isUrl = (p: string) => /^https?:\/\//i.test(p);
  if (isUrl(after.page) && isUrl(before.page) && after.page.replace(/\/+$/, "") !== before.page.replace(/\/+$/, "")) {
    return { ...base, comparable: false, reason: "Different pages" };
  }
  if (after.fingerprint !== before.fingerprint) {
    const why =
      after.model !== before.model ? `Different Jev version (${before.model} then ${after.model})`
      : after.questionVersion !== before.questionVersion ? "Different question wording"
      : "Different intent statement, expected terms or term list";
    return { ...base, comparable: false, reason: why };
  }
  for (const s of SCOPES) {
    const a = after.scores[s], b = before.scores[s];
    if (a && b) base.scores[s] = { before: b.score, after: a.score, delta: a.score - b.score, verdict: verdict(a.score - b.score, threshold) };
  }
  return { ...base, comparable: true };
}

/** Band for a mean of n page scores, each within the floor. */
export const floorOfMean = (floor: number, n: number) => (n > 0 ? floor / Math.sqrt(n) : floor);
