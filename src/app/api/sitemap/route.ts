import { discoverSitemap } from "@/lib/server/sitemap";
import { json, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.domain !== "string" || !body.domain.trim()) return fail("Enter a site address");
  try {
    return json(await discoverSitemap(body.domain, typeof body.sitemapUrl === "string" && body.sitemapUrl ? body.sitemapUrl : undefined));
  } catch (e: any) {
    return fail(e.message, 422, "sitemap");
  }
}
