import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, tokenFor } from "@/lib/server/auth";

// APP_AUTH=platform: a platform gate (such as Vercel Authentication) protects the deployment.
// APP_AUTH=password (default): the built-in password page. Production refuses to run open.
export async function middleware(req: NextRequest) {
  const mode = process.env.APP_AUTH || "password";
  if (mode === "platform") return NextResponse.next();
  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production" && process.env.JEV_MOCK !== "1") {
      return new NextResponse("Access gate not configured: set APP_PASSWORD, or APP_AUTH=platform behind a platform gate.", { status: 503 });
    }
    return NextResponse.next();
  }
  const ok = req.cookies.get(COOKIE)?.value === (await tokenFor(password));
  if (ok) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "auth", message: "Sign in first" } }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico|examples/).*)"],
};
