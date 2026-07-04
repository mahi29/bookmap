# BookMap — a reading tracker with an author-nationality map

> **Living document.** This is the source of truth for BookMap's design and status. Update
> it when decisions change. Last reconciled with the code after the "Add reading" flow (PR5).

## Context

A personal book-tracking website (like Goodreads/StoryGraph) whose signature feature is a
**choropleth world map** shading each country by how much the user has read from authors of
that nationality. It answers "how many countries have I read from?" — overall and within a
date range (e.g. "countries I read in 2026"). Single-user, no auth yet. Repo:
`github.com/mahi29/bookmap` (private); code at `/Users/mahith/Documents/BookMap`.

## Status at a glance

| Area                                  | State                                                             |
| ------------------------------------- | ----------------------------------------------------------------- |
| PR1 — Scaffold + model + seed         | ✅ done                                                           |
| PR2 — Wikidata nationality resolution | ✅ done                                                           |
| PR3 — Choropleth map + period filter  | ✅ done                                                           |
| PR4 — LLM fallback + corrections      | ✅ done (review **UI** built then replaced by direct DB edits)    |
| Multi-country nationality             | ✅ done (mid-course change — authors now hold _all_ citizenships) |
| PR5 — "Add reading" flow              | ✅ done                                                           |
| PR6 — CSV importer UI                 | ⬜ not started                                                    |
| PR7 — Multi-user auth                 | ⬜ future                                                         |
| Future enhancements                   | ⬜ see bottom section                                             |

## Ubiquitous language (shared glossary)

- **User** — a single implicit user (no auth). Schema stays user-scopable for later.
- **Book** — a title with one or more **Authors**; carries an optional ISBN/UID.
- **Author** — a person resolved to **one or more** _map countries_ (see Nationality).
- **Reading** — an _event_: "User finished Book on date X." A book read twice = two Readings;
  Readings carry the date, so all date-range filtering hangs off them.
- **Nationality / map country** — the set of ISO 3166-1 alpha-3 codes for **all** of an
  author's countries of citizenship. Stored one-row-per-country in `AuthorCountry`.
- **Coverage** — distinct map countries derived from the Authors of the Books in the User's
  Readings within a date range. Drives the "N countries" counter.
- **Intensity** — per country, the count of read Books attributable to it. A book counts
  **once per country**, so a co-authored _or_ dual-national book contributes to each of its
  countries. Drives map shading.
- **Review queue** — Authors with `needsReview = true` (nothing resolved, or low LLM
  confidence). Corrected by **direct DB edits** (`db:set` or Prisma Studio) — there is no
  review UI.

### Nationality resolution rules (the crux)

1. **Deterministic (Wikidata `P27`)** — search the author entity, verify it's a human, read
   every non-deprecated country-of-citizenship claim, and map each to a modern country. We
   keep **all** citizenships (no single-country tiebreak — dual nationals get both). An author
   is flagged `needsReview` only when _nothing_ maps.
2. **Defunct → successor** — USSR→RUS, Ottoman Empire→TUR, Yugoslavia→SRB, Czechoslovakia→CZE,
   etc., via an in-code lookup (the map renders modern borders). Also handles names/aliases.
3. **LLM fallback (Claude Opus 4.8)** — only for `needsReview` authors. Given the author name
   - their book titles, it returns `{ countryIso3s[], confidence, reasoning }` via structured
     output. Below a confidence threshold it stays in the queue; otherwise it resolves.
4. **Manual** — direct DB edits (`db:set`/Prisma Studio) set `resolutionMethod: "manual"`,
   which auto-resolution never clobbers and `db:seed` preserves across re-seeds.
5. OpenLibrary cross-referencing was **deferred** — Wikidata alone resolves ~80% and the LLM
   handles the rest, so a second fuzzy source wasn't worth it.

## Tech stack (as built)

- **Next.js 16 (App Router) + TypeScript** — one app; React 19; Server Actions for mutations.
- **Prisma 7 + SQLite** via the engine-free client + `@prisma/adapter-better-sqlite3` and a
  `prisma.config.ts`. Chosen over Postgres for zero-infra local single-user; swappable to
  Postgres (`@prisma/adapter-pg`) for deploy.
- **`d3-geo` + `topojson-client` + `world-atlas`**, rendered as SVG in our own `Choropleth`
  component. (`react-simple-maps` is React-18-only, so we hand-rolled.) Geometry joined to
  data via `world-countries` (ISO numeric ↔ alpha-3). Shading uses `color-mix` over design
  tokens on a sqrt scale.
- **`@anthropic-ai/sdk`**, model **`claude-opus-4-8`**, structured output via
  `output_config.format` (JSON schema). Needs `ANTHROPIC_API_KEY` at runtime.
- **Papaparse** for CSV; **Vitest** for tests.
- **CSS Modules + design tokens** (CSS custom properties in `globals.css`). **No Tailwind.**

## Engineering conventions (in `CLAUDE.md`)

- **TDD** — failing test first (Vitest), for CSV mapping, resolution/successor logic,
  aggregation, and input normalization.
- **Verify in the browser** — every UI change checked on localhost via the Preview MCP
  (screenshot + inspect), not just tests.
- **Separation of concerns** — `src/app/**` (components + thin server actions) / `src/lib/**`
  (pure, framework-free domain: parsing, resolution, aggregation) / `src/lib/db.ts` (single
  Prisma client). No file mixes JSX + business logic + DB. Styling in co-located CSS Modules
  referencing tokens — no utility-class soup, no inline `style` in logic.
- **Pragmatic, not over-engineered**; **strict TS + lint/format clean**.
- Atomic, revertable commits pushed to `main` as work progresses.

## Data model (Prisma)

- `Book` (id, title, isbn?, createdAt)
- `Author` (id, name **unique**, wikidataId?, birthCountryIso3?, resolutionMethod
  [`wikidata`|`openlibrary`|`llm`|`manual`|`unresolved`], confidence?, reasoning?,
  needsReview, resolvedAt)
- `AuthorCountry` (authorId, iso3) — `@@id([authorId, iso3])`; the **nationality FK**,
  one author → many countries. This is what the map reads and what manual edits write.
- `BookAuthor` (bookId, authorId) — co-authored books.
- `Reading` (id, bookId, dateRead?, dateStarted?, rating?, source
  [`storygraph`|`goodreads`|`manual`], importId?, rawRow?, createdAt)
- `Import` (id, source, filename, rowCount, importedAt)
- Country reference (valid ISO alpha-3 set + defunct→successor map) lives in **code**
  (`src/lib/countries.ts`), not the DB.
- Undated readings (`dateRead = null`) are all-time only; excluded from date-range views.

## Commands / pipeline

`npm run dev | test | lint | format` · `db:migrate` · `db:generate` — plus the data pipeline:

- `db:seed [csv]` — load a StoryGraph CSV (default `data/storygraph-export.csv`, gitignored).
  Wipes + reloads, but **preserves manual picks**.
- `db:resolve [--all] [N]` — resolve authors via Wikidata (default: only `unresolved`;
  `--all` re-resolves everyone _except_ manual).
- `db:resolve-llm` — Opus 4.8 fallback over the review queue (needs `ANTHROPIC_API_KEY`).
- `db:set -- "Author Name" ISO3 [ISO3 ...]` — set an author's countries manually (or
  `npx prisma studio` to edit the `AuthorCountry` table directly).

Rebuild-from-scratch recipe: `db:seed` → `db:resolve` → (`db:resolve-llm`) → `db:set` as
needed. Manual picks survive the whole loop.

## Delivered work

- **PR1** — Next 16 + TS + Prisma 7/SQLite scaffold, `CLAUDE.md`, schema + migration, country
  reference module, StoryGraph parser + seed script (all TDD).
- **PR2** — Wikidata resolver (pure tiebreak + I/O client, mocked-HTTP tests) + batch script.
- **PR3** — d3-geo choropleth: coverage + intensity shading, distinct-country counter, hover
  tooltip (country + book count), all-time/year period selector (client-side re-aggregation).
- **PR4** — LLM fallback (Opus 4.8, structured output). A review **UI** (`/review`) was built,
  then **removed** in favor of direct DB edits (`db:set` / Prisma Studio) — simpler surface,
  and corrections survive re-seed.
- **Multi-country nationality** — replaced the single-country field with the `AuthorCountry`
  join; resolvers keep every citizenship; dual nationals (Ishiguro→GBR+JPN, Yaa Gyasi→GHA+USA)
  resolve automatically instead of sitting in review.
- **PR5** — `/add` form: log a book + date; reuses an existing book for re-reads and resolves
  brand-new authors through Wikidata on submit so the map updates immediately.
- **Map polish** — a shading legend, and clickable countries that open a sliding right pane
  listing that country's books (title · authors · read date, most-recent first, range-aware).

## Remaining work

- **PR6 — CSV importer UI.** Promote the seed script into an upload page: StoryGraph first,
  then Goodreads (needs a Goodreads CSV parser); source tagging; dedup by ISBN/title+date;
  idempotent re-import; import summary.
- **PR7 — Multi-user auth.** Auth.js (NextAuth); scope all data by `userId`; optional
  shareable public map. Would also motivate the Postgres swap for deploy.

## Future enhancements (nice-to-haves, unscheduled)

- **Search-to-add (external book API)** — in `/add`, type a **title** (or ISBN) and autofill
  title + author(s) + ISBN from **Open Library** (`openlibrary.org/search.json`, free, no key)
  or **Google Books** (`googleapis.com/books/v1/volumes`), so you don't type the author.
  Title search → pick a result → autofill; ISBN lookup is unambiguous. Fully hands-free entry
  would need barcode/ISBN scanning (browser `BarcodeDetector` + camera). The picked author
  still flows through the existing Wikidata resolution. Manual entry stays as the fallback.
- **Deploy** — swap SQLite → Postgres (Neon) and ship on Vercel.
- **LLM sweep** — run `db:resolve-llm` over the remaining review queue once an API key is set.

## Verification

- **Local run:** `npm run dev`; Preview MCP to view/inspect the map.
- **End-to-end:** `db:seed` a StoryGraph CSV → `db:resolve` → open the map, confirm shaded
  countries + counter → correct a stray author with `db:set` and see the map update → filter
  to a year and confirm the counter/shading change → add a book via `/add` and confirm it
  appears.
- **Automated tests:** CSV parser, country successor mapping, the citizenship→countries
  mapping, coverage/intensity aggregation, LLM interpretation + confidence gate, and add-form
  input normalization. Wikidata/OpenLibrary HTTP and the Anthropic SDK are mocked (no live
  calls in tests).
- **Data integrity:** every stored country is a valid modern alpha-3; an author has countries
  **iff** not `needsReview`; counts reconcile (resolved + review = total).
