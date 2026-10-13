// Browser-side calls to the stateless server routes.

import type { JevIntentAnswer, JevTermsAnswer, PageText, Scope } from "./types";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.code ?? "http", data?.error?.message ?? `HTTP ${res.status}`, res.status);
  return data as T;
}

export type ServerConfig = { model: string; concurrency: number; questionVersion: string; mock: boolean; auth: string; error: string | null };
export const getConfig = () => call<ServerConfig>("/api/config");

export const findSitemap = (domain: string, sitemapUrl?: string) =>
  call<{ origin: string; sitemapUrl: string; urls: string[] }>("/api/sitemap", { domain, sitemapUrl });

export type Extracted = PageText & { url: string; status: number; source: string; warnings: string[] };
export const extract = (url: string, signal?: AbortSignal) => call<Extracted>("/api/extract", { url }, signal);

export const askIntent = (page: PageText, scope: Scope, intent: string, signal?: AbortSignal) =>
  call<JevIntentAnswer>("/api/jev", { kind: "intent", page, scope, intent }, signal);

export const askTerms = (page: PageText, scope: Scope, terms: string[], signal?: AbortSignal) =>
  call<JevTermsAnswer>("/api/jev", { kind: "terms", page, scope, terms }, signal);
