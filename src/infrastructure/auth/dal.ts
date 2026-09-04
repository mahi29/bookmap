import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSession } from "./session";
import type { SessionPayload } from "./session-token";

// The auth check pages and server actions rely on (the proxy redirect is only an
// optimistic front door). cache() memoizes per request/render pass. getSession()
// is the nullable variant: /map uses it to send anonymous visitors to the pitch.

/** The logged-in user, or null. Use on pages that should not hard-redirect to /login. */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  return readSession();
});

/** The logged-in user, or a redirect to /login. Call at the top of protected work. */
export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
});
