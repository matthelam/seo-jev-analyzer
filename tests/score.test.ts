import { describe, expect, it } from "vitest";
import { score, termSum, pointsAvailable, stat, level, scoreLevel, splitsIntoClusters, sdOfMean } from "@/lib/score";

const TERMS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
const EXPECTED = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

describe("score", () => {
  it("is the sum of the expected terms' ratings times intent fit", () => {
    const ratings = TERMS.map((_, i) => (i < 10 ? 0.5 : 1)); // k and l are not expected
    expect(termSum(TERMS, ratings, EXPECTED)).toBeCloseTo(5);
    expect(score(TERMS, ratings, EXPECTED, 0.8)).toBeCloseTo(4);
  });
  it("is bounded 0 to 10", () => {
    expect(score(TERMS, TERMS.map(() => 1), EXPECTED, 1)).toBeCloseTo(10);
    expect(score(TERMS, TERMS.map(() => 0), EXPECTED, 1)).toBe(0);
  });
  it("reproduces the worked example: keyword stuffing loses to an answer", () => {
    expect(5.44 * 0.37).toBeLessThan(3.4 * 0.99);
  });
  it("points available add up to 10 minus the score", () => {
    const ratings = TERMS.map((_, i) => (i % 3) / 3);
    const items = pointsAvailable(TERMS, ratings, EXPECTED, 0.6);
    const total = items.reduce((s, x) => s + x.points, 0);
    expect(total).toBeCloseTo(10 - score(TERMS, ratings, EXPECTED, 0.6));
    expect(items[0].points).toBeGreaterThanOrEqual(items.at(-1)!.points);
  });
});

describe("statistics", () => {
  it("uses the sample standard deviation", () => {
    const s = stat([1, 2, 3, 4]);
    expect(s.mean).toBe(2.5);
    expect(s.sd).toBeCloseTo(1.2910, 3);
  });
  it("marks overlapping bands as level", () => {
    expect(level(3.0, 0.01, 3.03, 0.01)).toBe(true);
    expect(level(3.0, 0.01, 3.1, 0.01)).toBe(false);
  });
  it("levels: weak below 2, fair to 3.5, strong above", () => {
    expect([scoreLevel(1.99), scoreLevel(2), scoreLevel(3.5), scoreLevel(3.51)]).toEqual(["weak", "fair", "fair", "strong"]);
  });
  it("flags two clusters", () => {
    expect(splitsIntoClusters([...Array(50).fill(3.0), ...Array(50).fill(3.5)])).toBe(true);
    expect(splitsIntoClusters(Array.from({ length: 100 }, (_, i) => 3 + (i % 7) * 0.002))).toBe(false);
  });
});

describe("profile band", () => {
  it("uses the SD of a mean, which shrinks with more pages", () => {
    expect(sdOfMean([0.02, 0.02, 0.02, 0.02])).toBeCloseTo(0.01);
    expect(sdOfMean(Array(18).fill(0.02))).toBeCloseTo(0.02 / Math.sqrt(18));
  });
});
