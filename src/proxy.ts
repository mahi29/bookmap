import { NextResponse, type NextRequest } from "next/server";
import { decryptSessionToken } from "@/infrastructure/auth/session-token";

// Optimistic auth gate (Next 16's proxy, née middleware): decrypt the session cookie
// and redirect — no DB access here. The real check is verifySession() in pages and
// server actions; this only keeps logged-out visitors from seeing protected shells
// and logged-in users off the auth pages.

const AUTH_ROUTES = new Set(["/login", "/signup"]);

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("session")?.value;
  const secret = process.env.SESSION_SECRET;
  const session = secret ? await decryptSessionToken(token, secret) : null;

  if (!session && !AUTH_ROUTES.has(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && AUTH_ROUTES.has(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
