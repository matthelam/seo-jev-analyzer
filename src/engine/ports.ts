// What the engine needs from the outside world. Adapters implement these; the engine never imports an adapter.

import type { PageMeta } from "@/core/schema";
import type { JudgeState } from "@/core/text";

export type IntentAnswer = { score: number; probabilities: Record<string, number>; model: string };
export type TermsAnswer = { ratings: number[]; model: string };

/** Asks the decision model. Ratings and scores are normalised to 0 to 1. */
export interface Judge {
  readonly model: string;
  readonly simulated: boolean;
  intentFit(state: JudgeState, intent: string): Promise<IntentAnswer>;
  termRatings(state: JudgeState, terms: string[]): Promise<TermsAnswer>;
}

export type ReadPage = { url: string; status: number; meta: PageMeta; body: string; source: string; warnings: string[] };

/** Fetches a public page and extracts its metadata and main body text. */
export interface PageReader {
  read(url: string): Promise<ReadPage>;
}

/** Reads a site's sitemap. */
export interface SiteMapper {
  discover(domain: string, sitemapUrl?: string): Promise<{ origin: string; sitemapUrl: string; urls: string[] }>;
}

/** Fetches a JSON document from a public URL. */
export interface DocumentFetcher {
  getJson(url: string): Promise<unknown>;
}

export type EngineSettings = {
  /** Parallel requests to the judge within one operation. */
  concurrency: number;
};
