// The web app's HTTP route and the MCP server must return the same thing for the same input,
// because both go through the one operation registry and engine.

import { beforeAll, describe, expect, it } from "vitest";

const TEXT = {
  meta: { title: "Kids' climbing classes | Example Gym", description: "Weekly kids' climbing classes for ages 5 to 14. $25 a session.", ogTitle: "", ogDescription: "", jsonLd: [] },
  body: "Kids' climbing classes\nOur kids' climbing classes run every Tuesday for children aged 5 to 14.\nEach session costs $25.\nBook today",
};
const TERMS = ["kids' climbing", "classes", "ages 5 to 14", "session", "price", "tuesday", "coach", "shoes", "parking", "membership", "yoga", "cafe"];
const REQ = { page: "https://gym.example/kids", text: TEXT, intent: "Are there kids' climbing classes, and what do they cost?", expected: TERMS.slice(0, 10), terms: TERMS, boilerplate: ["Book today"], runs: 2 };

let httpPost: (req: Request, ctx: any) => Promise<Response>;
let mcpPost: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.JEV_MOCK = "1";
  delete process.env.TYPESAFE_API_KEY;
  process.env.MCP_API_KEY = "test-key-0123456789";
  httpPost = (await import("@/app/api/v1/[operation]/route")).POST;
  mcpPost = (await import("@/app/api/mcp/route")).POST;
});

const http = async (op: string, body: unknown) => {
  const res = await httpPost(new Request(`http://local/api/v1/${op}`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ operation: op }) });
  return { status: res.status, body: await res.json() };
};

let rpcId = 0;
const mcp = async (method: string, params: unknown, key = "test-key-0123456789") => {
  const res = await mcpPost(new Request("http://local/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${key}`, "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  }));
  return { status: res.status, body: res.status === 200 ? await res.json() : await res.text() };
};
const strip = (r: any) => ({ ...r, scoredAt: "x", comparison: r.comparison ? { ...r.comparison, baselineScoredAt: "x" } : undefined });

describe("HTTP and MCP parity", () => {
  it("lists one MCP tool per operation", async () => {
    const r = await mcp("tools/list", {});
    expect(r.body.result.tools.map((t: any) => t.name).sort()).toEqual(
      ["compare_results", "discover_pages", "find_boilerplate", "get_method", "read_page", "score_page", "self_test", "test_revision"],
    );
  });
  it("get_method is identical", async () => {
    const a = await http("get_method", {});
    const b = await mcp("tools/call", { name: "get_method", arguments: {} });
    expect(b.body.result.structuredContent).toEqual(a.body);
    expect(a.body).toMatchObject({ model: "jev-1.13.0", questionVersion: "q1", noiseFloor: 0.194, simulated: true });
  });
  it("score_page is identical, and a result passed back as baseline compares", async () => {
    const a = await http("score_page", REQ);
    const b = await mcp("tools/call", { name: "score_page", arguments: REQ });
    expect(a.status).toBe(200);
    expect(strip(b.body.result.structuredContent)).toEqual(strip(a.body));
    expect(a.body.text.bodyChars).toBe(TEXT.body.length - "\nBook today".length);
    expect(a.body.runs).toBe(2);
    const edited = { ...REQ, text: { ...TEXT, meta: { ...TEXT.meta, description: "" } }, baseline: a.body, intent: undefined, expected: undefined, terms: undefined };
    const c = await mcp("tools/call", { name: "score_page", arguments: edited });
    const cmp = c.body.result.structuredContent.comparison;
    expect(cmp.comparable).toBe(true);
    expect(["up", "down", "level"]).toContain(cmp.scores.meta.verdict);
    const d = await http("compare_results", { result: c.body.result.structuredContent, baseline: a.body });
    expect(d.body).toEqual(cmp);
  });
  it("test_revision is identical, and its current result passes back as baseline", async () => {
    const req = { ...REQ, revision: { description: "Kids' climbing classes for ages 5 to 14, every Tuesday, $25 a session." } };
    const a = await http("test_revision", req);
    const b = await mcp("tools/call", { name: "test_revision", arguments: req });
    expect(a.status).toBe(200);
    const s = (r: any) => ({ ...r, current: strip(r.current), revised: strip(r.revised), comparison: { ...r.comparison, baselineScoredAt: "x" } });
    expect(s(b.body.result.structuredContent)).toEqual(s(a.body));
    expect(a.body).toMatchObject({ changed: ["description"], currentFrom: "scored", page: REQ.page });
    expect(a.body.comparison.comparable).toBe(true);
    const again = await http("test_revision", { ...REQ, baseline: a.body.current, revision: { title: "Kids' climbing classes, ages 5 to 14" } });
    expect(again.body.currentFrom).toBe("baseline");
  });
  it("errors match: missing inputs", async () => {
    const a = await http("score_page", { text: TEXT });
    const b = await mcp("tools/call", { name: "score_page", arguments: { text: TEXT } });
    expect(a.status).toBe(400);
    expect(b.body.result.isError).toBe(true);
    expect(b.body.result.content[0].text).toBe(`${a.body.error.code}: ${a.body.error.message}`);
  });
  it("both reject input that breaks the schema", async () => {
    const bad = { ...REQ, runs: 99 };
    const a = await http("score_page", bad);
    const b = await mcp("tools/call", { name: "score_page", arguments: bad });
    expect(a.status).toBe(400);
    expect(a.body.error.message).toContain("runs");
    const mcpError = b.body.error ?? (b.body.result?.isError ? b.body.result : null);
    expect(mcpError).toBeTruthy();
    expect(JSON.stringify(mcpError)).toContain("runs");
  });
  it("MCP refuses a wrong key", async () => {
    expect((await mcp("tools/list", {}, "wrong")).status).toBe(401);
  });
});
