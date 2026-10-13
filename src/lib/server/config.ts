// Server configuration from environment variables. Never imported by client code.

export const MODEL = process.env.JEV_MODEL || "jev-1.13.0";
export const API_URL = process.env.TYPESAFE_API_URL || "https://api.typesafe.ai/v1/systemone";
export const CONCURRENCY = Math.min(16, Math.max(1, Number(process.env.RUN_CONCURRENCY) || 4));
export const APP_AUTH = (process.env.APP_AUTH || "password") as "password" | "platform";

/** Test mode: deterministic fake Jev answers and fetching of local addresses. Only without a real key. */
export const MOCK = process.env.JEV_MOCK === "1" && !process.env.TYPESAFE_API_KEY;

export function configError(): string | null {
  if (!/^jev-\d+\.\d+\.\d+$/.test(MODEL)) return `JEV_MODEL must be a pinned version such as jev-1.13.0, not "${MODEL}"`;
  if (!MOCK && !process.env.TYPESAFE_API_KEY) return "TYPESAFE_API_KEY is not set";
  return null;
}
