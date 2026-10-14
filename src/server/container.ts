// Composition root: the one place that chooses adapters and builds the engine.

import { API_URL, CONCURRENCY, MODEL, SIMULATED, configError } from "@/adapters/config";
import { SimulatedJudge } from "@/adapters/jev/simulatedJudge";
import { TypeSafeJudge } from "@/adapters/jev/typesafeJudge";
import { HttpDocumentFetcher } from "@/adapters/web/documentFetcher";
import { HtmlPageReader } from "@/adapters/web/htmlReader";
import { SitemapReader } from "@/adapters/web/sitemapReader";
import { ScoringEngine } from "@/engine/engine";

let engine: ScoringEngine | null = null;

export function getEngine(): ScoringEngine {
  if (engine) return engine;
  const err = configError();
  if (err) throw new Error(err);
  const judge = SIMULATED ? new SimulatedJudge(MODEL) : new TypeSafeJudge(MODEL, API_URL, process.env.TYPESAFE_API_KEY!);
  engine = new ScoringEngine(judge, new HtmlPageReader(), new SitemapReader(), new HttpDocumentFetcher(), { concurrency: CONCURRENCY });
  return engine;
}
