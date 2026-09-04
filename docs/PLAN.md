# BookMap — a reading tracker with an author-nationality map

> **Living document.** This is the source of truth for BookMap's design and status. Update
> it when decisions change. Last reconciled at the **PR7 + deploy checkpoint** (multi-user
> auth shipped; live in production on Vercel + a Neon prod branch).

## Context

A personal book-tracking website (like Goodreads/StoryGraph) whose signature feature is a
**choropleth world map** shading each country by how much the user has read from authors of
that nationality. It answers "how many countries have I read from?" — overall and within a
date range (e.g. "countries I read in 2026"). Multi-user with username/password auth. Repo:
`github.com/mahi29/bookmap` (private); code at `/Users/mahith/Documents/BookMap`.

## Status at a glance

| Area                                    | State                                                             |
| --------------------------------------- | ----------------------------------------------------------------- |
| PR1 — Scaffold + model + seed           | ✅ done                                                           |
| PR2 — Wikidata nationality resolution   | ✅ done                                                           |
| PR3 — Choropleth map + period filter    | ✅ done                                                           |
| PR4 — LLM fallback + corrections        | ✅ done (review **UI** built then replaced by direct DB edits)    |
| Multi-country nationality               | ✅ done (mid-course change — authors now hold _all_ citizenships) |
| PR5 — "Add reading" flow                | ✅ done                                                           |
| Map polish (legend + country pane)      | ✅ done                                                           |
| LLM verify pass + code-quality refactor | ✅ done (this checkpoint)                                         |
| PR6 — CSV importer UI                   | ⬜ not started                                                    |
| Deploy (Postgres + Vercel)              | ✅ done — live at bookmap-flame.vercel.app (Neon prod branch)     |
| PR7 — Multi-user auth                   | ✅ done (hand-rolled credentials — see below)                     |
| Search-to-add (Google Books typeahead)  | ✅ done (keyless v1; API key is a follow-up)                      |
| Future enhancements                     | ⬜ see bottom section                                             |

## Ubiquitous language (shared glossary)

- **User** — an account (unique username + bcrypt password hash). Readings and Imports
  are per-user; Books/Authors/nationalities are global facts shared by everyone.
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
- **Prisma 7 + Postgres (Neon)** via the engine-free client + `@prisma/adapter-pg` and a
  `prisma.config.ts`. One Postgres provider for both dev and prod — `DATABASE_URL` selects
  a separate Neon branch/database per environment (no local-file fallback). Originally
  SQLite for zero-infra local dev; moved to Postgres ahead of deploy so dev/prod share one
  SQL dialect instead of maintaining two.
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
- **Separation of concerns** — `src/app/**` (components + thin server actions) /
  `src/domains/**` (framework-free domain: parsing, resolution, aggregation, auth rules) /
  `src/infrastructure/**` (mechanisms: the single Prisma client, resolution repository,
  password/session/cookie handling). No file mixes JSX + business logic + DB. Styling in
  co-located CSS Modules referencing tokens — no utility-class soup, no inline `style` in
  logic.
- **Pragmatic, not over-engineered**; **strict TS + lint/format clean**.
- Atomic, revertable commits pushed to `main` as work progresses.

## Data model (Prisma)

- `User` (id, username **unique**, passwordHash [bcrypt; `LOCKED` sentinel = can't log in
  until claimed via `db:set-password`], createdAt)
- `Book` (id, title, isbn?, createdAt)
- `Author` (id, name **unique**, wikidataId?, birthCountryIso3?, resolutionMethod
  [`wikidata`|`openlibrary`|`llm`|`manual`|`unresolved`], confidence?, reasoning?,
  needsReview, resolvedAt). **Known limitation:** `name` is globally `@unique`, so two
  real different people sharing an exact name string are currently treated as one
  Author/nationality — no disambiguation. This also constrains the PR6 dedup design
  above: author-set matching inherits the same-name-same-author assumption.
- `AuthorCountry` (authorId, iso3) — `@@id([authorId, iso3])`; the **nationality FK**,
  one author → many countries. This is what the map reads and what manual edits write.
- `BookAuthor` (bookId, authorId) — co-authored books.
- `Reading` (id, **userId**, bookId, dateRead?, dateStarted?, rating?, source
  [`storygraph`|`goodreads`|`manual`], importId?, rawRow?, createdAt; indexes on
  `bookId` and `(userId, dateRead)`)
- `Import` (id, **userId**, source, filename, rowCount, importedAt)
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
- `db:set-password -- <username> <password>` — set/reset an account password directly;
  how a `LOCKED` bootstrap account (from the PR7 migration or the seed) gets claimed.

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
- **Search-to-add** — `/add` title field is a typeahead: library matches first, then Google
  Books (keyless `volumes` search, also by ISBN), capped at 5. Picking a hit fills title +
  authors and persists ISBN on the `Book` (including a lazy backfill onto an existing
  title+author match whose `isbn` is still null; an already-set ISBN is never clobbered).
  Editing title or authors after a pick **drops the ISBN** (it may no longer identify that
  volume). Manual entry remains the fallback when nothing matches. Authors still resolve
  through Wikidata on submit.
- **Map polish** — a shading legend, and clickable countries that open a sliding right pane
  listing that country's books (title · authors · read date, most-recent first, range-aware).
- **LLM verify pass (`db:verify-llm`)** — ran Claude over all non-manual authors with book-title
  context; corrected 60 (wrong-person matches like Óscar Martínez→Spain, plus enriched dual
  nationals like Hosseini→AFG+USA) and collapsed the review queue from ~43 to 5.
- **Code-quality checkpoint** — extracted `persistResolution` / `setManualCountries` (single
  author-write path; the "never clobber a manual pick" invariant is enforced here, not scattered),
  a `ResolutionMethod` / `ReadingSource` constants module (no more stray string literals), a
  `scripts/shared.ts` harness (`runScript`, `sleep`, `createLlmClient`), and named the map's
  shading-ramp constants. Behavior-preserving; 60 tests still green.
- **PR7 — Multi-user auth + prod deploy** — hand-rolled credentials (bcryptjs + jose
  session cookie, open signup), `Reading`/`Import` scoped by `userId` with Books/Authors
  global, existing readings backfilled to a bootstrap `mahith` user via the migration.
  Shipped live to https://bookmap-flame.vercel.app on a dedicated Neon prod branch. Full
  detail in the Deploy bullet under the (now historical) "Remaining work" section below.

## Current data state (local dev.db, gitignored)

- ~28 countries · ~236 read books on the map. **5 authors still need a manual country**
  (LLM couldn't place them): Eunice Hong, Jeffrey Wilson, Evan Winter, Matthew Campbell,
  Tom Wright — set with `db:set -- "Name" ISO3`.
- The DB holds all 301 CSV books (238 read + 63 unread); **only read books reach the map**.
  Decision: **keep** the 63 unread books and their 53 resolved authors as-is (no seed
  change, no cleanup) — they cost nothing (the map only reads from Readings, so unread
  books never affect it), and they set up a free future "want to read"/"to-read countries"
  feature.

## Remaining work

- **Deploy — ✅ done (2026-07-04). Live at https://bookmap-flame.vercel.app** (auth-gated).
  Was deliberately split from PR7 auth (shipping to a public URL didn't need multi-user
  solved first), but both landed together in the end: the site went live already running
  the PR7 auth code, so there was never a public no-login phase in production.
  - **Code done:** schema `datasource` provider → `postgresql`; `src/lib/db.ts` and
    `prisma.config.ts` use `@prisma/adapter-pg` / `PrismaPg`. `DATABASE_URL` (pooled, for
    the running app) and `DIRECT_URL` (unpooled, for `prisma migrate` — PgBouncer's
    transaction-mode pooling doesn't reliably support the advisory locks migrations need;
    `prisma.config.ts` falls back to `DATABASE_URL` if `DIRECT_URL` isn't set) — see
    `.env.example`. Both `db.ts` and `prisma.config.ts` load `.env` themselves (Next.js
    auto-loads it, but the Prisma CLI and `scripts/*.ts` via `tsx` don't); old SQLite
    migration history removed (incompatible SQL dialect). Neon's connection strings use
    `sslmode=require`, normalized in `db.ts` to the explicit `sslmode=verify-full` it's
    currently an alias for, ahead of a future `pg`/`pg-connection-string` major that
    changes what that implies. One Postgres provider for **both** dev and prod via
    separate Neon branches, not a dual SQLite-dev/Postgres-prod setup.
  - **Done:** Neon `dev` branch created; initial migration applied
    (`prisma/migrations/20260704191642_init`); existing local data (301 books, 242
    authors incl. 9 manual picks and the 5-author review queue, 238 readings) migrated
    from `dev.db` via a one-time export→import script (not committed — scratch tooling,
    re-creatable the same way for the production branch when ready). Verified via
    `npm run db:check` (all 4 checks pass) and Preview MCP: 28 countries · 236 books,
    matching pre-migration exactly.
  - **Prod cutover (done):** the GitHub repo is connected to a Vercel project that
    auto-deploys from `main` and points at a **separate** production Neon branch
    (host `ep-broad-haze`, distinct from local dev's `ep-patient-paper` — the two are
    independent databases, each with its own copy of the readings). Vercel env has
    `DATABASE_URL` (prod pooled) and a fresh `SESSION_SECRET`; `DIRECT_URL` /
    `ANTHROPIC_API_KEY` are not needed at runtime. Note the Vercel build runs only
    `next build` + `prisma generate` — **migrations are NOT auto-applied on deploy**, so
    schema changes must be pushed to prod manually with `prisma migrate deploy` (pointed
    at the prod branch) **before** deploying code that depends on them. The home page is
    request-dynamic (reads the session cookie), no longer prerendered.
  - **PR7 prod migration (done):** ran `prisma migrate deploy` against the prod branch
    (applied `add_user` + `reading_import_per_user`, creating the LOCKED `mahith`
    bootstrap user and backfilling all 238 prod readings + 1 import to it), then claimed
    the account with `db:set-password -- mahith …` pointed at prod, then pushed `main`.
    Live site verified: `/` redirects to `/login`; logging in as `mahith` shows the map.
  - **Future schema-change recipe for prod:** (1) `prisma migrate deploy` against the
    prod branch first (additive/backfill migrations keep the currently-deployed code
    working), (2) then `git push origin main` to redeploy the code. Never push
    schema-dependent code before the prod migration runs, or the live site 500s until it
    does.
  - `ANTHROPIC_API_KEY` is only used by the offline `db:resolve-llm`/`db:verify-llm`
    scripts, run manually against whichever `DATABASE_URL` you point at — it is not needed
    as a Vercel env var for the deployed app.
- **PR6 — CSV importer UI.** Promote the seed script into an upload page: StoryGraph first,
  then Goodreads (needs a Goodreads CSV parser); source tagging; dedup by ISBN/title+date;
  idempotent re-import; import summary.
  - **Dedup key:** two rows are the same reading if they share
    `(isbn OR normalizedTitle+authors, dateRead)` — an ISBN match (when present) or a
    normalized title + author-set match, AND the same read date. Re-imports must be
    idempotent under this key (a no-op on repeat). Note: author-set matching inherits the
    `Author.name` uniqueness assumption below (same name = same author).
- **PR7 — Multi-user auth. ✅ Done** (2026-07-04). **Decision reversal:** originally
  penciled in as Auth.js (NextAuth) + invite-only; built instead as **hand-rolled
  credentials with open signup** — for a toy app OAuth felt heavy, Auth.js's Credentials
  provider is second-class with unproven Next 16 support, and the official Next 16 auth
  guide (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`) documents the
  hand-rolled pattern end-to-end.
  - **As built:** `bcryptjs` password hashing (pure JS — native bcrypt/argon2 break Vercel
    builds; any non-bcrypt stored hash, notably the `LOCKED` sentinel, never authenticates)
    - `jose`-signed stateless JWT session cookie (HS256 via **`SESSION_SECRET`** env var —
      required locally and on Vercel; HttpOnly/secure/lax, 30-day) + a `cache()`d
      `verifySession()` DAL (the real check, in `page.tsx` and mutating server actions) + an
      optimistic redirect gate in `src/proxy.ts` (Next 16 renamed middleware → proxy).
      Logged-out `/` redirects to `/login` (which carries the pitch + signup link).
  - **Layering:** domain rules in `src/domains/auth/` (`validate-credentials`,
    `auth-service`); mechanisms in `src/infrastructure/auth/` (`password`, `session-token`,
    `session`, `dal`); pages/actions in `src/app/(auth)/`; logout in the map header.
    The home page is now request-dynamic (reads the session cookie) — no longer
    prerendered at build time.
  - **Data scoping (as decided):** `Reading` and `Import` carry a `userId` FK (cascade);
    all reading/import queries scope by the logged-in user. `Book`, `Author`, and
    `AuthorCountry` stay **global/shared** — an author's nationality is a universal fact,
    not user-specific, and resolution (Wikidata/LLM) is expensive, so duplicating it per
    user has no value. B6 indexes added (`Reading(bookId)`, `Reading(userId, dateRead)`,
    `BookAuthor(authorId)`).
  - **Existing-data migration:** the `reading_import_per_user` migration adds the columns
    nullable, creates a bootstrap `mahith` user with the `LOCKED` sentinel hash
    (`ON CONFLICT DO NOTHING`), backfills every Reading/Import to it, then sets NOT NULL —
    repeatable verbatim against the production branch via `prisma migrate deploy`, safe
    whether or not a real `mahith` account already exists there. The bootstrap account is
    claimed with **`npm run db:set-password -- mahith <password>`** (signup rejects the
    existing username; the LLM scripts' pattern applies — run it pointed at whichever
    `DATABASE_URL`).
  - **Scripts:** `db:seed` is dev-only and now takes `-- --user <username>` (default
    `mahith`; wipes **all** users' readings, creates the user LOCKED if missing).
    `db:check` prints per-user reading/import counts.
  - Also landed: REVIEW.md **A5** (race-proof `persistResolution` — the manual guard is
    now part of the write, in one transaction with the country replacement).

## Future enhancements (nice-to-haves, unscheduled)

- **Public landing page** — logged-out `/` currently redirects to `/login`. To pitch
  instead: drop `/` from the proxy's protected set (keep `/add`), add a nullable
  `getSession()` helper next to `verifySession()`, and branch `page.tsx` — session → map,
  none → a `Landing` component (pitch + login/signup buttons; a decorative map is cheap
  since `Choropleth` already takes an `entries` prop). Data fetching stays in the
  logged-in branch, so anonymous visitors never trigger per-user queries. ~1 short session.
- **Google Books API key** — v1 calls `googleapis.com/books/v1/volumes` **keyless**. That
  works at low volume but the shared quota is tight and can 429. Follow-up: provision a
  `GOOGLE_BOOKS_API_KEY`, put it in `.env` / Vercel, and send it on the server-side search
  (never expose it to the client). Open Library remains an unused alternative.
- **Barcode / ISBN scanning** — fully hands-free entry would need browser `BarcodeDetector`
  - camera on `/add`. The typeahead already accepts a typed ISBN.
- **LLM sweep** — with `ANTHROPIC_API_KEY` in `.env`: `db:resolve-llm` clears the review
  queue, and `db:verify-llm` re-checks **all** non-manual authors against their book titles
  to catch wrong-but-confident Wikidata matches. Manual picks are never touched. (Cost ~$1
  for the full library on Opus 4.8.)

### Known follow-ups / tech debt (from the code review, deferred by choice)

- **Memoize `getCountryShapes()`** (`geo.ts`) — it re-parses the TopoJSON on every request
  though the shapes are static; compute once at module load.
- **Integration test for `addReading`** (`readings.ts`) — the pure normalizer is tested; the
  DB+resolve mutation is only verified manually.
- **Map keyboard/a11y** — `Choropleth` paths are click-only; `CountryPanel` has no Escape/focus
  management. Fine for personal use; revisit if it goes public.
- **`getMapEntries` ships the whole dataset to the client** — great at current scale; move
  aggregation server-side if the library gets large or goes multi-user.

## Verification

- **Local run:** `npm run dev`; Preview MCP to view/inspect the map.
- **End-to-end:** `db:seed` a StoryGraph CSV → `db:resolve` → open the map, confirm shaded
  countries + counter → correct a stray author with `db:set` and see the map update → filter
  to a year and confirm the counter/shading change → add a book via `/add` (typeahead pick
  or manual fallback) and confirm it appears.
- **Automated tests:** CSV parser, country successor mapping, the citizenship→countries
  mapping, coverage/intensity aggregation, LLM interpretation + confidence gate, add-form
  input normalization, Google Books JSON mapping, library/Google hit merge, and ISBN
  persist/reuse. Wikidata/Google Books HTTP and the Anthropic SDK are mocked (no live
  calls in tests).
- **Data integrity:** every stored country is a valid modern alpha-3; an author has countries
  **iff** not `needsReview`; counts reconcile (resolved + review = total).
