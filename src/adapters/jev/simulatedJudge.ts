// Simulated Jev for tests and demos. Deterministic: the same text and question always give the same answer.
// A term's rating rises with how often it appears in the text; intent fit with how many of the intent's words appear.

import type { JudgeState } from "@/core/text";
import type { Judge } from "@/engine/ports";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const STOP = new Set(["there", "what", "they", "where", "when", "much", "does", "have", "with", "this", "that", "your", "from", "into", "about", "which", "will", "should", "could", "would", "many", "more", "over", "find", "need"]);

function level(base: number, salt: string) {
  const jitter = ((hash(salt) % 1000) / 1000 - 0.5) * 0.04;
  const s = Math.max(0, Math.min(4, base + jitter));
  const lo = Math.floor(s), hi = Math.min(4, lo + 1), w = s - lo;
  const probabilities: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 };
  probabilities[String(lo)] += 1 - w;
  probabilities[String(hi)] += w;
  return { score: s / 4, probabilities };
}

export class SimulatedJudge implements Judge {
  readonly simulated = true;
  constructor(readonly model: string) {}

  async intentFit(state: JudgeState, intent: string) {
    const text = JSON.stringify(state).toLowerCase();
    const words = (intent.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w));
    const base = (4 * words.filter((w) => text.includes(w)).length) / Math.max(1, words.length);
    return { ...level(base, `intent|${intent}|${text.length}`), model: this.model };
  }

  async termRatings(state: JudgeState, terms: string[]) {
    const text = JSON.stringify(state).toLowerCase();
    const ratings = terms.map((t) => level(Math.min(4, (text.split(t.toLowerCase()).length - 1) * 1.2), `term|${t}|${text.length}`).score);
    return { ratings, model: this.model };
  }
}
