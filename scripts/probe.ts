// Phase 2 probe: repeat both Jev requests on a few pages and practice texts,
// then report run-to-run spread, the practice-text check, model version and usage.
// Usage: npx tsx scripts/probe.ts <config.json> <results.json>
// Reads TYPESAFE_API_KEY (and optional JEV_MODEL, TYPESAFE_API_URL) from the environment or .env.local.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extractPage, removeRepeatedLines, type ExtractedPage } from "../src/extract";
import { intentRequest, termRequest, norm, scoped, type PageState, type Scope } from "../src/questions";

function loadEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
loadEnv();

const KEY = process.env.TYPESAFE_API_KEY;
const MODEL = process.env.JEV_MODEL || "jev-1.13.0";
const URL = process.env.TYPESAFE_API_URL || "https://api.typesafe.ai/v1/systemone";
if (!KEY) throw new Error("TYPESAFE_API_KEY is not set");
if (/latest|preview/.test(MODEL)) throw new Error(`JEV_MODEL must be a pinned version, not ${MODEL}`);

type Usage = { input_tokens: number; output_tokens: number };
const usage: Usage = { input_tokens: 0, output_tokens: 0 };
const versions = new Set<string>();

async function ask(body: unknown, attempt = 0): Promise<any> {
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`Jev ${res.status} after retries`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return ask(body, attempt + 1);
  }
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  versions.add(json.model);
  usage.input_tokens += json.usage?.input_tokens ?? 0;
  usage.output_tokens += json.usage?.output_tokens ?? 0;
  return json;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1 || 1));
};

type Subject = { name: string; intent: string; state: PageState; expected?: string[]; target?: string };

async function main() {
  const [cfgPath, outPath] = process.argv.slice(2);
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8").replace(/^\uFEFF/, ""));
  const terms: string[] = cfg.terms;
  const runs: number = cfg.runs;

  const fetched: ExtractedPage[] = [];
  for (const p of cfg.pages) fetched.push(await extractPage(cfg.baseUrl + p.path));
  const cleaned = removeRepeatedLines(fetched);
  const subjects: Subject[] = [
    ...cfg.pages.map((p: any, i: number) => ({
      name: p.path,
      intent: p.intent,
      expected: p.expected,
      state: { meta: cleaned[i].meta, body: cleaned[i].body },
      metaRaw: cleaned[i].meta,
    })),
    ...cfg.practice.map((t: any) => ({ name: `practice:${t.name}`, intent: t.intent, target: t.target, state: { meta: t.meta, body: t.body } })),
  ];

  const started = Date.now();
  const SCOPES: Scope[] = ["meta", "page"];
  const raw: Record<string, { intent: number[]; terms: number[][] }> = {};
  for (const s of subjects) {
    for (const sc of SCOPES) {
      const key = `${sc}|${s.name}`;
      const st = scoped(s.state, sc);
      raw[key] = { intent: [], terms: terms.map(() => []) };
      for (let r = 0; r < runs; r++) {
        const [a, b] = await Promise.all([ask(intentRequest(MODEL, st, s.intent)), ask(termRequest(MODEL, st, terms))]);
        raw[key].intent.push(norm(a.answers.intent_fit.score));
        terms.forEach((_, i) => raw[key].terms[i].push(norm(b.answers[`t${String(i).padStart(2, "0")}`].score)));
      }
    }
  }
  const seconds = (Date.now() - started) / 1000;

  const report: any = { model: MODEL, versionsSeen: [...versions], runs, seconds, usage, subjects: {} };
  const termSds: Record<string, number[]> = { meta: [], page: [] };
  const intentSds: Record<string, number[]> = { meta: [], page: [] };
  for (const sc of SCOPES) for (const s of subjects) {
    const key = `${sc}|${s.name}`;
    const d = raw[key];
    const termStats = terms.map((t, i) => ({ term: t, mean: mean(d.terms[i]), sd: sd(d.terms[i]), min: Math.min(...d.terms[i]), max: Math.max(...d.terms[i]) }));
    termStats.forEach((x) => termSds[sc].push(x.sd));
    intentSds[sc].push(sd(d.intent));
    const ranked = [...termStats].sort((a, b) => b.mean - a.mean);
    const top10 = ranked.slice(0, 10).map((x) => x.term);
    const entry: any = {
      intent: { mean: mean(d.intent), sd: sd(d.intent), runs: d.intent },
      top10: ranked.slice(0, 10).map((x) => ({ term: x.term, mean: +x.mean.toFixed(3), sd: +x.sd.toFixed(3) })),
      maxTermSd: Math.max(...termStats.map((x) => x.sd)),
      extraction: s.name.startsWith("/") && sc === "page" ? { source: fetched[cfg.pages.findIndex((p: any) => p.path === s.name)].source, warnings: fetched[cfg.pages.findIndex((p: any) => p.path === s.name)].warnings, bodyChars: s.state.body.length } : undefined,
    };
    if (s.expected) entry.top10Agreement = top10.filter((t) => s.expected!.includes(t)).length;
    if (s.target) entry.practicePass = ranked[0].term === s.target && mean(d.intent) >= 0.75;
    if (sc === "meta") entry.meta = s.state.meta;
    report.subjects[key] = entry;
  }
  report.siteSd = Object.fromEntries(SCOPES.map((sc) => [sc, { terms: mean(termSds[sc]), intent: mean(intentSds[sc]), maxTermSd: Math.max(...termSds[sc]) }]));
  report.versionLockOk = report.versionsSeen.length === 1 && report.versionsSeen[0] === MODEL;
  writeFileSync(outPath, JSON.stringify({ report, raw }, null, 1));

  console.log(`model ${MODEL}; versions seen ${report.versionsSeen.join(", ")}; lock ok ${report.versionLockOk}`);
  console.log(`runs ${runs}; ${seconds.toFixed(1)} s; tokens in ${usage.input_tokens} out ${usage.output_tokens}`);
  for (const sc of SCOPES) console.log(`site SD [${sc}] terms ${report.siteSd[sc].terms.toFixed(4)} (max ${report.siteSd[sc].maxTermSd.toFixed(4)}); intent ${report.siteSd[sc].intent.toFixed(4)}`);
  for (const [n, e] of Object.entries<any>(report.subjects)) {
    console.log(`\n${n}: intent ${e.intent.mean.toFixed(3)} sd ${e.intent.sd.toFixed(3)}` + (e.top10Agreement !== undefined ? `; top-10 agreement ${e.top10Agreement}/10` : "") + (e.practicePass !== undefined ? `; practice ${e.practicePass ? "PASS" : "FAIL"}` : "") + (e.extraction ? `; from ${e.extraction.source}, ${e.extraction.bodyChars} chars${e.extraction.warnings.length ? ", warnings: " + e.extraction.warnings.join("; ") : ""}` : ""));
    if (e.meta) console.log(`  meta: title "${e.meta.title}"; description "${e.meta.description}"; og "${e.meta.ogTitle}"; json-ld ${e.meta.jsonLd?.length ?? 0} values`);
    console.log("  " + e.top10.map((x: any) => `${x.term} ${x.mean}`).join(" | "));
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
