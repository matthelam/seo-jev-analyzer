// MCP endpoint (Streamable HTTP). Requires Authorization: Bearer <key from MCP_API_KEY>; off when no key is set.

import { handleMcp } from "@/server/mcp";
import { apiKeys, bearerName } from "@/server/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!apiKeys().length) return Response.json({ error: { code: "disabled", message: "MCP is off: set MCP_API_KEY (16 characters or more)" } }, { status: 503 });
  const caller = bearerName(req.headers.get("authorization"));
  if (!caller) {
    return Response.json({ error: { code: "auth", message: "Send Authorization: Bearer <key>" } }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }
  console.log(`mcp ${req.method} caller=${caller}`);
  return handleMcp(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
