# Code review — findings & improvement backlog

> Produced by a full-codebase review (2026-07-03), written so any session can pick
> items off independently. Tick items as they land; delete sections that become
> irrelevant. Companion to [`PLAN.md`](PLAN.md) — this is the "what to improve"
> ledger, PLAN.md remains the source of truth for design/status.
>
> **Convention reminders for whoever picks these up:** TDD (failing test first),
> verify UI changes in the browser via Preview MCP, atomic commits, keep PLAN.md
> updated when a decision below gets made.

**Overall verdict:** healthy codebase. Layering (pure domain in `src/lib`, thin
app shell, single Prisma seam), TDD coverage of the tricky logic, and the
single-write-path invariant for manual picks are all sound. Nothing is on fire.
Findings ranked by value.

---

## A. Correctness & data integrity (highest value)

- [x] **A1. Seed script can permanently destroy manual picks on a mid-run crash.**
      `scripts/seed.ts` reads manual picks into memory → `deleteMany`s everything →
      reloads → restores picks. No transaction. A crash between delete and restore
      (bad CSV row, SQLite lock, Ctrl-C) loses every hand-corrected author — and
      "manual picks survive re-seed" is a stated invariant.
      **Fix:** wrap reset+reload in `prisma.$transaction`, or write picks to a JSON
      file in `data/` before deleting (crash-proof, also fixes half-seeded state).
      Combine with B3 (`createMany`) — same code.
      **Done** — reset+reload+restore now runs inside a single `prisma.$transaction`
      (`scripts/seed.ts`); `setManualCountries` takes an optional transaction client.
      `createMany` batching (B3) was evaluated and skipped — see B3.

- [x] **A2. `addReading` reuses books by title alone — cross-author collisions
      corrupt the map.** `src/lib/readings.ts` (`addReading`) does
      `findFirst({ where: { title } })`. Titles collide across literature ("Hunger":
      Hamsun and Roxane Gay). Adding the second attaches the reading to the first
      book, upserts the new author onto it, and the book then counts for _both_
      authors' countries — silently wrong intensity.
      **Fix:** match on title **and** author set (or title+ISBN); else create a new
      book. Failing test first.
      **Done (TDD)** — book reuse now requires the author-name set to match; a
      title collision with a different author set creates a new `Book` row.

- [ ] **A3. Countries absent from the 110m geometry vanish from the map but not
      the counter.** Verified: `world-atlas/countries-110m.json` has 177 shapes and
      **omits Singapore, Malta, Mauritius, Bahrain, Barbados, Hong Kong** (and other
      microstates); Kosovo/Somaliland/N. Cyprus exist but have no ISO numeric id, so
      `src/lib/geo.ts` tags them `iso3: null`. A Singaporean author resolves fine and
      counts in "N countries", but nothing shades and nothing is clickable.
      **Options:** (a) switch to `countries-50m` (has the small states; bigger
      payload), (b) dot markers for shapeless countries, (c) minimum: a data check
      that every resolver-producible ISO3 has a shape + a UI note ("not shown on
      map: …"). Pairs well with a country _list_ view.
      **Deferred** (2026-07-03) — Q2 answered as "defer for now"; revisit once
      there's appetite for it. `db:check` (D3) already surfaces the gap generically
      in the meantime.

- [x] **A4. Date validation accepts rolled-over garbage.**
      `normalizeReadingInput` (`src/lib/readings.ts`) regex-checks `YYYY-MM-DD`, but
      `Date.UTC(2026, 12, 45)` rolls "2026-13-45" into Feb 2027 and the NaN guard
      never fires. Browser date inputs mask it; the server action accepts raw
      FormData. **Fix:** verify the constructed date round-trips to the same Y/M/D.
      One line + one test.
      **Done (TDD)** — the constructed date is checked to round-trip to the exact
      parsed Y/M/D; rolled-over dates now return `{ ok: false }`.

- [x] **A5. `persistResolution` read-then-write race.**
      `src/lib/nationality/persist.ts` checks `resolutionMethod !== manual`, then
      updates in a second statement. Theoretical single-user; violates never-clobber
      under multi-user concurrency. **Fix (fold into PR7):** make the guard part of
      the write (`updateMany` with `resolutionMethod: { not: manual }` in the
      `where`) + countries write in a transaction.
      **Done (PR7)** — `persistResolution` now runs one `$transaction`: `updateMany`
      with the `NON_MANUAL` filter in the `where` (count 0 → return false, nothing
      written), then `authorCountry` deleteMany/createMany in the same transaction
      (`src/infrastructure/db/prisma-author-resolution-repository.ts`).

- [x] **A6. `db:verify-llm` applies corrections with no review step.** A
      confident-but-wrong LLM answer overwrites a correct Wikidata answer before the
      corrections list prints. **Fix:** `--dry-run` flag (print would-be corrections,
      write nothing).
      **Done** — `npm run db:verify-llm -- --dry-run` runs the same verification and
      prints the same summary, but skips every `persistResolution()` write.

- [x] **A7a.** `MapView.tsx` year range uses inclusive `Dec 31 23:59:59`; works
      for date-only data but brittle — use exclusive `< Jan 1 (y+1)`.
      **Done** — range now uses `Date.UTC(y + 1, 0, 1)` and `inRange()` in
      `coverage.ts` compares with `>=`; boundary cases covered in `coverage.test.ts`.
- [x] **A7b.** `Author.name` is globally `@unique` — two real authors sharing a
      name become one row/nationality. Acceptable simplification; **record as known
      limitation in PLAN.md** (it also shapes PR6 dedup design).
      **Done** — documented in PLAN.md's Author entry, cross-referenced from the
      PR6 dedup-key spec (D2).
- [ ] **A7c.** Author names matched byte-exact across seed/add
      ("J.R.R. Tolkien" vs "J. R. R. Tolkien" = two authors). Add name
      normalization at the boundary (natural home: an `AuthorName` value object in
      the shared kernel — see C).

## B. Performance

- [x] **B1. Memoize `getCountryShapes()`** (`src/lib/geo.ts`) — re-parses the
      static TopoJSON per request. Hoist to module scope. (Already on PLAN.md tech
      debt.) One line.
      **Done** — module-level cache; first call computes, later calls return it.
- [x] **B2. Stop shipping static geometry through the RSC payload.**
      `src/app/page.tsx` passes `shapes` (hundreds of KB) as a server→client prop,
      re-serialized every request. `Choropleth` is already a client component —
      import the topojson client-side so it becomes an immutable cached JS chunk;
      the dynamic payload shrinks to just `entries`. Do together with B1.
      **Done** — `Choropleth.tsx` now calls `getCountryShapes()` itself; the
      `shapes` prop is gone from `page.tsx`/`MapView.tsx`. `npm run build` confirms
      the world-atlas data lands in a static client chunk.
- [ ] **B3. Seed inserts row-by-row** (~900 sequential statements). Use
      `createMany` per table inside the A1 transaction — instant and atomic in one
      move.
      **Evaluated, skipped for now** — `Book.create()`'s generated id is needed by
      the `BookAuthor`/`Reading` rows created after it; batching would need
      pre-generated cuids and a loop restructure, not worth the risk alongside the
      A1 transaction fix. Left as a follow-up.
- [ ] **B4. Cache Wikidata country-entity lookups** across authors in
      `resolve-nationalities` (module-level `Map<qid, {label, alpha3}>`) — most of
      the library resolves to a handful of QIDs. Low priority (politeness delay
      dominates).
- [ ] **B5. LLM sweeps via the Anthropic Message Batches API** (50% cost, no
      sleep loops) — natural fit for `db:verify-llm` over the full library. Only
      worth it if sweeps become routine; at ~$1/pass, skip until then.
- [x] **B6. Postgres-era indexes** (when the multi-user schema lands): Prisma
      does not auto-index FK columns — add `@@index` on `Reading(bookId)`,
      `Reading(dateRead)` (or `(userId, dateRead)`), `BookAuthor(authorId)`.
      **Done (PR7)** — `Reading(bookId)`, `Reading(userId, dateRead)`, and
      `BookAuthor(authorId)` indexes added in the `reading_import_per_user`
      migration alongside the userId columns.

**Explicit non-problems:** client-side re-aggregation on period change, the sqrt
shading ramp, `computeCoverage`'s pair-set, the hover handler — all fine at this
scale; don't "fix" them.

## C. Structure

- [x] **C1. Execute the DDD reorg** (fully specified move plan agreed in review
      discussion — summarize here for standalone use): 5 commits, `git mv`, tests
      green between each.
      **Done** (2026-07-05) — all 5 commits landed exactly as specced; `src/lib/` is
      gone. Along the way, found and fixed a real bug the moves exposed: a test's
      `vi.mock(...)` path went stale after commit 1, silently stopped intercepting,
      and `addReading` ran against the live dev database (cleaned up the exact
      polluted rows) — added a fail-loud guard in `infrastructure/db/prisma.ts` that
      throws if the real module loads under Vitest, so a stale mock can't silently
      hit a live DB again. Browser-verified after commit 5 (map, click-to-panel, and
      the review-queue/undated hints all still work); `db:check` stayed clean
      throughout.
  1. `src/lib/db.ts` → `src/infrastructure/db/prisma.ts`
  2. Shared kernel: `countries.ts` + `constants.ts` → `src/domains/shared/`
  3. Nationality context: `nationality/{resolve,wikidata,llm}.ts` →
     `src/domains/nationality-resolution/{resolve-country,wikidata-resolver,llm-resolver}.ts`;
     `nationality/persist.ts` → `src/infrastructure/db/prisma-author-resolution-repository.ts`
  4. Reading-log context: split `readings.ts` →
     `domains/reading-log/{normalize-reading,reading-service}.ts`;
     `storygraph.ts` → `domains/reading-log/storygraph-import.ts`
  5. Coverage context: `coverage.ts` → `domains/coverage/coverage-service.ts`;
     `geo.ts` → `domains/coverage/geo.ts`; `map-data.ts` →
     `domains/coverage/map-query.ts` (a read model, **not** a repository).
     Browser-verify after this commit (app import paths change).

  Notes: `@/` alias works in Next + Vitest; scripts use `tsx` (no tsconfig
  paths) so keep relative imports there. Interfaces only where a second
  implementation exists: resolution persistence + the Wikidata/LLM clients
  (tests mock them). Optional follow-ups: `Iso3CountryCode` + `AuthorName`
  value objects in the shared kernel. **Timing: immediately before PR7** —
  multi-user rewrites these files anyway.

- [x] **C2.** Deduplicate the `unresolved()` result constructor
      (`nationality/resolve.ts` + `wikidata.ts`) when the files move.
      **Done** — `resolve-country.ts`'s `unresolved()` is now exported;
      `wikidata-resolver.ts` spreads `wikidataId` onto it instead of a local copy.
      Also caught and fixed a third, identically-shaped instance in
      `llm-resolver.ts`'s catch block (not in the original scope, but the same
      duplication).
- [x] **C3.** `llm.ts#mapCountries` re-implements `chooseMapCountry`'s
      map-and-dedupe — share one "raw strings → map countries" helper (the
      `Iso3CountryCode` VO's job).
      **Done** — extracted as `resolveToMapCountries()` in the shared kernel
      (`domains/shared/countries.ts`), with its own test coverage; both resolvers
      call it now. (Didn't introduce the full `Iso3CountryCode` value object —
      this thin function covers the actual duplication; the VO remains an
      optional future step if primitive-string handling elsewhere warrants it.)
- [x] **C4. Review-queue visibility:** 5 authors need manual countries and the
      UI never says so. A one-line "N authors unplaced" note on the map page (no
      review UI, just visibility).
      **Done** — `getNeedsReviewCount()` in `map-data.ts`; MapView shows
      "N authors need a country" (muted text) only when count > 0.
- [x] **C5. Undated-readings hint:** year views silently exclude undated
      readings; add "+N undated not shown" to the period header.
      **Done** — MapView shows "+N undated books not shown" next to the period
      selector when a specific year is selected and undated readings exist.

**Verified current (no action):** `llm.ts` API usage — `claude-opus-4-8`,
`output_config.format` structured output — matches the current Anthropic API.

## D. PLAN.md / approach

- [x] **D1. Record the multi-user scoping decision in PLAN.md:**
      `Reading`/`Import` get `userId`; `Book`/`Author`/`AuthorCountry` stay global
      (nationality is universal, resolution is expensive). Makes PR7 small; prevents
      a future session from redesigning it.
      **Done** — recorded under PR7 in PLAN.md's Remaining work.
- [x] **D2. Spec PR6 dedup key:** `(isbn || normalizedTitle+authors, dateRead)`;
      re-import is a no-op. Fold in the A7b name-uniqueness limitation.
      **Done** — recorded under PR6 in PLAN.md's Remaining work, cross-referencing
      the A7b limitation.
- [x] **D3. Promote the "Data integrity" checklist into `db:check`:** valid
      ISO3s; countries iff not `needsReview`; counts reconcile; every resolved
      country has a map shape (from A3). Turns prose invariants into enforcement.
      **Done** — `npm run db:check` (new `scripts/check.ts`) runs all four checks
      and exits nonzero on any failure; the map-shape check surfaces the A3 gap
      generically (e.g. flags `VAT`) without hardcoding country names.
- [x] **D4. Deploy prep:** `db.ts` + `prisma.config.ts` hardcode the SQLite
      path — move to a `DATABASE_URL` env var as a standalone commit so the
      Neon/Postgres swap is purely additive.
      **Done** — both read `process.env.DATABASE_URL ?? "file:./prisma/dev.db"`.
- [x] **D5. Close the unread-books question:** recommendation — keep the 63
      unread books / 53 resolved authors (zero cost; the map only reads Readings;
      free "to-read countries" feature later). Decide and update PLAN.md either way.
      **Done** — PLAN.md's "Current data state" now states this as the decision,
      not an open question.

## Suggested priority order

1. ~~A1 + A4 (data protection; small, test-first) — fold B3 into A1.~~ **Done**
   (B3 evaluated and deliberately skipped — see B3).
2. ~~A2 (the one real map-correctness bug).~~ **Done.**
3. ~~B1 + B2 (the whole perf win, one commit).~~ **Done.**
4. A3 + country list view (still blocked on Q2) + ~~D3 (`db:check`)~~ **D3 done**
   — map visibility.
5. C1 DDD reorg → then PR7 multi-user with A5 + D1 + D4 folded in. (D1/D4
   recorded/done ahead of schedule — see D1, D4 — but A5 itself and the reorg
   are still pending, to be done together right before PR7.)

## Open questions (blocking direction, not code) — resolved 2026-07-03

- **Q1.** Is deploy + multi-user still the next milestone? — **Yes.** PR7
  (multi-user auth + deploy) is next. A5 folds into it (already scoped that way
  above); D1/D4 were already done ahead of schedule. **Next concrete step per
  the priority order below: the C1 DDD reorg, immediately before PR7 work
  starts.**
- **Q2.** Shapeless countries (Singapore et al.) — **Deferred for now.** No map
  UI decision needed yet; `db:check` (D3) already flags the gap generically
  (e.g. `VAT`) so it isn't silently lost. Revisit later.
