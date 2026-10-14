// HTTP front door: POST /api/v1/{operation}. Thin: the operation registry and the engine do the work.

import { NextResponse } from "next/server";
import { execute, findOperation } from "@/server/operations";
import { getEngine } from "@/server/container";
import { toApiError } from "@/server/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request, ctx: { params: Promise<{ operation: string }> }) {
  const { operation } = await ctx.params;
  if (!findOperation(operation)) return json({ error: { code: "not_found", message: `No operation ${operation}` } }, 404);
  const body = await req.json().catch(() => ({}));
  try {
    return json(await execute(getEngine(), operation, body));
  } catch (e) {
    const err = toApiError(e);
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
}
