// MCP front door: one tool per operation, generated from the same registry as the HTTP routes.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { OPERATIONS, execute } from "./operations";
import { getEngine } from "./container";
import { toApiError } from "./errors";

export const SERVER_INFO = { name: "seo-jev-analyzer", version: "0.3.0" };

export function buildMcpServer() {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Scores web pages against an intent statement and 10 expected search terms with the Jev decision model. " +
      "Typical flow: get_method once; score_page before an edit and keep the JSON; edit; score_page again with that JSON as baseline. " +
      "To try content before publishing: test_revision with only the changed fields; keep its current result and pass it as baseline for each further revision. " +
      "Small changes are level: within noise floor x sqrt(1/runs + 1/baseline runs).",
  });
  for (const o of OPERATIONS) {
    server.registerTool(
      o.name,
      {
        title: o.title,
        description: o.description,
        inputSchema: o.input as any,
        outputSchema: o.output as any,
        annotations: { readOnlyHint: o.readOnly, openWorldHint: true, idempotentHint: !o.costly },
      },
      (async (args: unknown) => {
        try {
          const out = (await execute(getEngine(), o.name, args)) as Record<string, unknown>;
          return { content: [{ type: "text" as const, text: JSON.stringify(out) }], structuredContent: out };
        } catch (e) {
          const err = toApiError(e);
          return { isError: true, content: [{ type: "text" as const, text: `${err.code}: ${err.message}` }] };
        }
      }) as any,
    );
  }
  return server;
}

/** Stateless Streamable HTTP: a fresh server and transport per request, JSON responses. */
export async function handleMcp(req: Request): Promise<Response> {
  const server = buildMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // The JSON response is complete once handleRequest resolves.
    void server.close();
  }
}
