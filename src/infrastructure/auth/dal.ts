import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSession } from "./session";
import type { SessionPayload } from "./session-token";

// The auth check pages and server actions rely on (the proxy redirect is only an
// optimistic front door). cache() memoizes per request/render pass.

/** The logged-in user, or a redirect to /login. Call at the top of protected work. */
export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
});
