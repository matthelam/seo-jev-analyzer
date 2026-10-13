import { extractPage } from "@/extract";
import { checkUrl } from "@/lib/server/safeUrl";
import { json, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const url = checkUrl(String(body.url ?? "")).toString();
    const page = await extractPage(url);
    if (page.status >= 400) return fail(`The page returned HTTP ${page.status}`, 422, "fetch");
    return json({ url: page.url, status: page.status, meta: page.meta, body: page.body, source: page.source, warnings: page.warnings });
  } catch (e: any) {
    return fail(e.message, 422, "extract");
  }
}
