// Server-side Jev client: adds the key, pins the model, checks the reported version.

import { API_URL, MODEL, MOCK } from "./config";
import { intentRequest, termRequest, norm, type PageState } from "@/questions";

export class ModelMismatch extends Error {
  constructor(public reported: string) {
    super(`Jev answered with ${reported}, not the pinned ${MODEL}`);
  }
}

async function post(body: any): Promise<any> {
  if (MOCK) return mockAnswer(body);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    if (json.model !== MODEL) throw new ModelMismatch(json.model);
    return json;
  }
}

export async function askIntent(page: PageState, intent: string) {
  const json = await post(intentRequest(MODEL, page, intent));
  const a = json.answers.intent_fit;
  return { score: norm(a.score), probabilities: a.probabilities as Record<string, number>, model: json.model as string };
}

export async function askTerms(page: PageState, terms: string[]) {
  const json = await post(termRequest(MODEL, page, terms));
  const ratings = terms.map((_, i) => norm(json.answers[`t${String(i).padStart(2, "0")}`].score));
  return { ratings, model: json.model as string };
}

// ---- Test mode ---------------------------------------------------------------
// Deterministic answers: a term's rating rises with how often it appears in the page text,
// intent fit with how many of the intent's words appear; a small jitter gives calibration a spread.
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
let mockCounter = 0;
function mockAnswer(body: any) {
  const text = JSON.stringify(body.state.page).toLowerCase();
  const answers: Record<string, any> = {};
  for (const [id, q] of Object.entries<any>(body.questions)) {
    let base: number;
    if (id === "intent_fit") {
      const STOP = new Set(["there", "what", "they", "where", "when", "much", "does", "have", "with", "this", "that", "your", "from", "into", "about", "which", "will", "should", "could", "would", "many", "more", "over", "find", "need"]);
      const words = (String(body.state.intent).toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w));
      base = (4 * words.filter((w) => text.includes(w)).length) / Math.max(1, words.length);
    } else {
      const term = String(q.instructions).match(/"([^"]+)"/)?.[1]?.toLowerCase() ?? "";
      base = Math.min(4, (term ? text.split(term).length - 1 : 0) * 1.2);
    }
    const jitter = ((hash(id + text.length + mockCounter++) % 1000) / 1000 - 0.5) * 0.04;
    const s = Math.max(0, Math.min(4, base + jitter));
    const lo = Math.floor(s), hi = Math.min(4, lo + 1), w = s - lo;
    const probabilities: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 };
    probabilities[String(lo)] += 1 - w;
    probabilities[String(hi)] += w;
    answers[id] = { type: "score", score: s, probabilities, confidence: 1 - w };
  }
  return { model: MODEL, answers, usage: { input_tokens: 0, output_tokens: 0 } };
}
