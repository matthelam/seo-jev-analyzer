// Browser client for the engine's operations (POST /api/v1/{operation}). Typed by the core schemas.

import type { z } from "zod";
import type { BoilerplateResult, DiscoverResult, MethodResult, ScoreRequest, ScoreResult } from "@/core/schema";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function call<T>(operation: string, body: unknown = {}, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api/v1/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.code ?? "http", data?.error?.message ?? `HTTP ${res.status}`, res.status);
  return data as T;
}

export type Method = z.infer<typeof MethodResult>;
export const getMethod = () => call<Method>("get_method");
export const discoverPages = (domain: string, sitemapUrl?: string) => call<z.infer<typeof DiscoverResult>>("discover_pages", { domain, sitemapUrl });
export const findBoilerplate = (urls: string[], signal?: AbortSignal) => call<z.infer<typeof BoilerplateResult>>("find_boilerplate", { urls }, signal);
export const scorePage = (req: ScoreRequest, signal?: AbortSignal) => call<ScoreResult>("score_page", req, signal);
