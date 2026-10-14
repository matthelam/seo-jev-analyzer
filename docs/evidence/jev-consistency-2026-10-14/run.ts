// Jev consistency experiment. Scores frozen page text repeatedly with the app's own questions.
// Resumable: appends one JSON line per answer pair to results.jsonl and skips work already done.
// Usage (from the repo root): npx tsx docs/evidence/jev-consistency-2026-10-14/run.ts docs/evidence/jev-consistency-2026-10-14
import { readFileSync, existsSync, appendFileSync, writeFileSync } from "node:fs";
import { intentRequest, termRequest, norm, scoped, QUESTION_VERSION, type Scope } from "../../../src/questions";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const KEY = process.env.TYPESAFE_API_KEY!;
const MODEL = "jev-1.13.0";
const URL = "https://api.typesafe.ai/v1/systemone";
if (!KEY) throw new Error("no key");

const dir = process.argv[2];
const cfg = JSON.parse(readFileSync(`${dir}/config.json`, "utf8"));
const pages = JSON.parse(readFileSync(`${dir}/pages.json`, "utf8"));
const out = `${dir}/results.jsonl`;

// Fixed shuffle so expected terms are not always first in the question list.
function shuffled<T>(xs: T[], seed: number) {
  const a = [...xs]; let s = seed;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const subjects = cfg.pages.map((p: any, i: number) => {
  const fp = pages[i];
  if (fp.url.indexOf(p.id === "wikipedia" ? "wikipedia" : "") < 0) throw new Error("page order");
  return { ...p, url: fp.url, terms: shuffled([...p.expected, ...p.others], 7 + i), state: { meta: fp.meta, body: fp.body } };
});
writeFileSync(`${dir}/subjects.json`, JSON.stringify(subjects.map((s: any) => ({ id: s.id, label: s.label, kind: s.kind, url: s.url, intent: s.intent, expected: s.expected, terms: s.terms, bodyChars: s.state.body.length })), null, 1));

type Task = { id: string; cond: "base" | "improved" | "degraded"; scope: Scope; run: number };
const tasks: Task[] = [];
for (let r = 0; r < cfg.runs; r++) for (const s of subjects) for (const scope of ["meta", "page"] as Scope[]) tasks.push({ id: s.id, cond: "base", scope, run: r });
for (let r = 0; r < cfg.variantRuns; r++) for (const s of subjects) for (const cond of ["improved", "degraded"] as const) tasks.push({ id: s.id, cond, scope: "meta", run: r });

const done = new Set<string>();
if (existsSync(out)) for (const l of readFileSync(out, "utf8").split("\n")) if (l.trim()) { const d = JSON.parse(l); done.add(`${d.id}|${d.cond}|${d.scope}|${d.run}`); }
const todo = tasks.filter((t) => !done.has(`${t.id}|${t.cond}|${t.scope}|${t.run}`));
console.log(`tasks ${tasks.length}, done ${done.size}, to do ${todo.length}`);

async function ask(body: unknown, attempt = 0): Promise<any> {
  const res = await fetch(URL, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 429 || res.status === 499 || res.status === 408 || res.status >= 500) { retries++;
    if (attempt >= 7) throw new Error(`Jev ${res.status} after retries`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return ask(body, attempt + 1);
  }
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

let i = 0, n = 0, retries = 0;
const t0 = Date.now();
async function worker() {
  while (i < todo.length) {
    const t = todo[i++];
    const s = subjects.find((x: any) => x.id === t.id);
    const meta = t.cond === "base" ? s.state.meta : { ...s.state.meta, ...s[t.cond] };
    const st = scoped({ meta, body: s.state.body }, t.scope);
    const start = Date.now();
    const [a, b] = await Promise.all([ask(intentRequest(MODEL, st, s.intent)), ask(termRequest(MODEL, st, s.terms))]);
    const ratings = s.terms.map((_: string, k: number) => norm(b.answers[`t${String(k).padStart(2, "0")}`].score));
    appendFileSync(out, JSON.stringify({
      ...t, q: QUESTION_VERSION, modelA: a.model, modelB: b.model, ms: Date.now() - start, at: new Date().toISOString(),
      intent: norm(a.answers.intent_fit.score), intentProbs: a.answers.intent_fit.probabilities, intentConf: a.answers.intent_fit.confidence,
      ratings, tokensIn: (a.usage?.input_tokens ?? 0) + (b.usage?.input_tokens ?? 0),
    }) + "\n");
    if (++n % 50 === 0) console.log(`${n}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s retries ${retries}`);
  }
}
Promise.all(Array.from({ length: 6 }, worker)).then(() => console.log("finished")).catch((e) => { console.error("FAILED", e.message); process.exit(1); });
