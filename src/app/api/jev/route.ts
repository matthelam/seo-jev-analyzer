import { askIntent, askTerms, ModelMismatch } from "@/lib/server/jev";
import { configError } from "@/lib/server/config";
import { json, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 60_000;

export async function POST(req: Request) {
  const err = configError();
  if (err) return fail(err, 503, "config");
  const body = await req.json().catch(() => ({}));
  const page = body.page;
  if (!page || typeof page !== "object" || typeof page.meta !== "object") return fail("Missing page");
  if (typeof page.body === "string" && page.body.length > MAX_BODY) page.body = page.body.slice(0, MAX_BODY);
  const state = body.scope === "meta" ? { meta: page.meta } : { meta: page.meta, body: page.body ?? "" };
  try {
    if (body.kind === "intent") {
      if (typeof body.intent !== "string" || !body.intent.trim()) return fail("Missing intent statement");
      return json(await askIntent(state, body.intent));
    }
    if (body.kind === "terms") {
      const terms = body.terms;
      if (!Array.isArray(terms) || !terms.length || terms.length > 100 || terms.some((t: unknown) => typeof t !== "string")) return fail("Terms must be 1 to 100 strings");
      return json(await askTerms(state, terms));
    }
    return fail("kind must be intent or terms");
  } catch (e: any) {
    if (e instanceof ModelMismatch) return fail(e.message, 409, "model_mismatch");
    return fail(e.message, 502, "jev");
  }
}
