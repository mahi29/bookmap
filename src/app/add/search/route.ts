import { NextRequest } from "next/server";
import { searchBooks } from "@/domains/book-search/search-books";
import { readSession } from "@/infrastructure/auth/session";

// Typeahead endpoint for /add. Auth is checked here (the proxy also covers
// /add/*, but this is the real gate). Google Books is queried server-side so
// the browser never talks to Google directly.

export async function GET(request: NextRequest): Promise<Response> {
  const session = await readSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  const hits = await searchBooks(query);
  return Response.json({ hits });
}
