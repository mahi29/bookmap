import { NextResponse, type NextRequest } from "next/server";
import { decryptSessionToken } from "@/infrastructure/auth/session-token";

// Optimistic auth gate (Next 16's proxy, née middleware): decrypt the session cookie
// and redirect — no DB access here. The real check is on the page or in server actions.
// Anonymous `/map` goes to the pitch; other protected shells go to `/login`. Logged-in
// visitors are kept off `/` and the auth pages.

const AUTH_ROUTES = new Set(["/login", "/signup"]);
const PUBLIC_ROUTES = new Set(["/", ...AUTH_ROUTES]);
const APP_HOME = "/map";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("session")?.value;
  const secret = process.env.SESSION_SECRET;
  const session = secret ? await decryptSessionToken(token, secret) : null;

  if (!session && pathname === APP_HOME) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (!session && !PUBLIC_ROUTES.has(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && (pathname === "/" || AUTH_ROUTES.has(pathname))) {
    return NextResponse.redirect(new URL(APP_HOME, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
