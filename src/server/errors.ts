// Maps engine and validation errors to one error shape, used by the HTTP routes and the MCP tools alike.

import { ZodError } from "zod";
import { InputError } from "@/core/inputs";
import { EngineError } from "@/engine/engine";
import { ModelMismatch } from "@/adapters/jev/typesafeJudge";

export type ApiError = { code: string; message: string; status: number };

/** Thrown when the engine's own output fails its published schema: a server fault, never the caller's. */
export class OutputError extends Error {}

export function toApiError(e: unknown): ApiError {
  if (e instanceof OutputError) return { code: "internal", status: 500, message: e.message };
  if (e instanceof InputError) return { code: "bad_request", status: 400, message: e.message };
  if (e instanceof ZodError) return { code: "bad_request", status: 400, message: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
  if (e instanceof EngineError) return { code: e.code, status: e.code === "bad_request" ? 400 : e.code === "not_found" ? 404 : e.code === "unsupported" ? 409 : 502, message: e.message };
  if (e instanceof ModelMismatch) return { code: "model_mismatch", status: 409, message: e.message };
  const message = e instanceof Error ? e.message : String(e);
  return { code: "failed", status: 422, message };
}
