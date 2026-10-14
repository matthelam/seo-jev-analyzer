import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, tokenFor, bearerOk } from "@/server/auth";
import { APP_AUTH, APP_PASSWORD, PRODUCTION, SIMULATED } from "@/adapters/config";

// APP_AUTH=platform: a platform gate (such as Vercel Authentication) protects the deployment.
// APP_AUTH=password (default): the built-in password page. Production with a real Jev key refuses to run open.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // MCP checks its own bearer key; scripts may call the HTTP operations with the same key.
  if (path === "/api/mcp" || (path.startsWith("/api/") && bearerOk(req.headers.get("authorization")))) return NextResponse.next();
  if (APP_AUTH === "platform") return NextResponse.next();
  if (!APP_PASSWORD) {
    if (PRODUCTION && !SIMULATED) {
      return new NextResponse("Access gate not configured: set APP_PASSWORD, or APP_AUTH=platform behind a platform gate.", { status: 503 });
    }
    return NextResponse.next();
  }
  if (req.cookies.get(COOKIE)?.value === tokenFor(APP_PASSWORD)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: { code: "auth", message: "Sign in first" } }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(path)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico|examples/).*)"],
};
