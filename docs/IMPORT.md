# CSV import follow-ups

> Backlog from PR6 (generic `/import`). **Identity is the one that matters.**
> PLAN.md stays the living index; this file is the work list and the identity plan.
> Status: v1 shipped as confirm-then-commit; none of the items below are done.

## Identity

Two real people who share a name are one `Author` today. Import and `/add` both
treat that as a fact, not a prompt. Until this changes, nationality (and therefore
the map) can be attributed to the wrong person.

### What the app does today

- `Author.name` is globally `@unique`. There is no second John Doe.
- `/add` upserts by name. The importer binds a case-insensitive exact name hit to
  that row with **no confirm**.
- Unique last-name shorthand (`Hemingway` → Ernest Hemingway) auto-binds when
  exactly one catalog author has that last name, with a preview warning. Shared
  last names (`Wilson` matching two Wilsons) are already ambiguous.
- `wikidataId` exists on `Author` but is not unique and is not an identity key.
  Resolution _uses_ Wikidata; persistence still keys people by the name string.
- Collisions already in the DB cannot be unmerged automatically. Whatever was
  upserted together stays one person, one nationality set.

This is the same limitation as REVIEW.md A7b. Import made it user-facing.

### Goal

A person is a stable id, not a display name.

- Two authors may share `name`.
- Import and `/add` never silently merge. Same-name hits are a choice:
  **this existing person** vs **someone new**.
- When Wikidata has resolved someone, `wikidataId` is the person key (unique
  when set). Name is a label.
- Last-name shorthand never auto-commits; it is a suggestion the user accepts.

### Target model

Keep `Author.id` as the FK everything else already uses (`BookAuthor`,
`AuthorCountry`). Change how we _find_ an author, not how we _point_ at one.

```
Author
  id
  name              // NOT unique — display string, as typed / as Wikidata labeled
  wikidataId?       // UNIQUE when set (Postgres unique allows multiple NULLs)
  qualifier?        // short disambiguator when there is no Q-id yet
                    // e.g. birth year, "the novelist", a book title
  …resolution fields unchanged
```

Do **not** add `@@unique([name, qualifier])` as the real identity. Qualifiers are
for humans in the picker; Wikidata id (or the cuid) is identity. Two unresolved
"John Doe" rows with empty qualifier must be allowed, or the feature does not
work.

Optional later: a normalized search form of the name (REVIEW A7c — `J.R.R.` vs
`J. R. R.`) as a generated column or stored field. That is matching, not identity.

### How import should behave after this

| CSV author                                 | Catalog                                                                                                             | Action |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------ |
| Exact name, **one** existing author        | Propose that person (show 1–2 book titles + nationality if any). User must pick **Same person** or **Someone new**. |
| Exact name, **several** existing authors   | Always pick. Never default.                                                                                         |
| Single-token last name, unique             | Same as “one existing”: suggestion, not auto-ready.                                                                 |
| Single-token last name, several            | Pick, as v1.                                                                                                        |
| No catalog hit                             | Create a new `Author` (unresolved).                                                                                 |
| User says someone new, name already exists | Insert a second row with the same `name`.                                                                           |

Book matching then uses **author ids**, not name strings. Dedup key becomes
`(isbn OR normalizedTitle+authorIds, dateRead)`.

`/add` must stop `upsert` by name and use the same picker when the typed name
hits someone. Otherwise import will be careful and `/add` will keep merging.

### Wikidata

Resolution already searches by name and can attach the wrong human (that is why
`db:verify-llm` exists). After identity:

- Persist `wikidataId` as `@unique`. A second author with the same Q-id is a
  bug; merge or refuse.
- Two authors, same display name, different Q-ids — the success case.
- Two authors, same display name, both `unresolved` — allowed. The map only
  shades whoever has countries; the user can still attach the wrong row to a
  book by picking badly.
- Re-resolution must not collapse two ids because the names match. The guard
  is “this `Author.id` already has a `wikidataId` / `manual`” — which
  `persistResolution` already respects for manual, and should respect for a
  set `wikidataId` too.

### Migration (existing data)

1. **Schema:** drop `@unique` on `name`; add unique index on `wikidataId`
   where not null. Additive, then code. Prod: migrate first, then deploy
   (PLAN.md recipe).
2. **Already-merged people stay merged.** If two John Does were upserted into
   one row, we cannot split them from the name string. Do not try to infer
   splits from book titles in v1 of this change.
3. **Split later, as a tool:** duplicate the `Author`, reassign chosen
   `BookAuthor` rows, clear/re-resolve nationality on the new row. Manual, rare,
   script-first (`db:split-author`) before any UI.
4. **Call sites to change together:** `addReading` upsert, import
   `resolveAuthorId` / `bindAuthorName`, `db:seed` author cache-by-name,
   `db:set` (look up by name — ambiguous once names collide; switch to id or
   require a qualifier).

### Suggested order (identity only)

1. **No schema — stop auto-committing last-name shorthand.** Move unique
   last-name hits into the same confirm list as ambiguous rows (pre-checked
   suggestion). Exact full-name hits can stay auto-bind until step 2, because
   the unique constraint still makes “someone new” impossible.
2. **Drop `name` uniqueness + confirm on every name hit + stop `/add` upsert.**
   This is the actual identity change. Import and `/add` share one “find or
   create author” helper that never infers sameness from the string alone.
3. **`wikidataId @unique`.** Resolution writes the Q-id; matching can prefer
   it when present. Wrong-person Wikidata hits stay a resolution problem, not
   an identity-model problem.
4. **Split-author script** for the already-merged cases, if they show up.

Steps 1 is safe to do in isolation. Steps 2–3 are one schema+code change.
Step 4 is independent and can wait until someone actually needs a split.

---

## Matching and commit

- **Ready `BindPlan`s are echoed from the client.** Commit checks that a
  `bookId` still exists; it does not fully re-derive the plan. A stale or
  tampered plan can attach a reading to the wrong global book (still only for
  the logged-in user). Re-run matching on commit, or sign/hash the preview.
- **Catalog can change between preview and commit.** Re-match, or reject if
  the snapshot is stale.
- **Authorless ambiguous titles stay “need a choice” on re-import** (e.g.
  Hunger) even when one candidate is already on the user’s library. After they
  pick, it correctly skips as a duplicate. Clunky; could prefer the candidate
  they already read, still without auto-picking the other.
- **Unknown ISBN, no title → incomplete.** No Open Library / Google Books
  lookup (PLAN.md lists that for `/add` later). ISBN-only rows only work if
  the edition is already in the global catalog.
- **Garbage ISBN + a title:** ISBN is dropped; the row still imports on
  title/author. Prefer invalid, or keep the raw value for `rawRow` only.
- **CSV ISBN is not written onto an existing book** that has `isbn = null`.
  Filling it in would help the next ISBN-only import; overwriting a different
  ISBN must not happen.
- **Title match** is case-insensitive + collapsed whitespace only. No
  punctuation / leading-article folding. `"The Sun Also Rises!"` will not hit
  `"The Sun Also Rises"`.
- **Multi-token fuzzy names do not match.** `"Scott Fitzgerald"` will not
  bind to `"F. Scott Fitzgerald"`. Only exact fold or single-token last name.
  REVIEW A7c (punctuation in initials) is the same family of bug for `/add`
  and seed.

## Product and ops

- **StoryGraph / Goodreads exports are not accepted in `/import`.** `db:seed`
  still loads StoryGraph as a destructive dev reset. A later parser can map
  those columns onto the same `ParsedImportRow`.
- **New authors do not shade the map until `db:resolve`.** `/add` resolves
  Wikidata inline; import does not (timeout risk). Options: background job,
  cap unique new authors per commit, or a post-import “resolve now” action.
- **Review UI lists counts for ready/duplicate, not every line.** Warnings,
  incomplete, invalid, and ambiguous rows are listed. A collapsible ready
  table would make confirm less blind.
- **Every confirm inserts an `Import` row**, even if every reading was a
  duplicate. Harmless; noisy for `db:check`.
- **Dates:** `YYYY-MM-DD` and `YYYY/MM/DD` only. Other export formats fail
  the row.
- **Persist tests use an in-memory Prisma fake** (same as `addReading`). No
  real-DB integration test for commit/dedup/transaction rollback.
- **Confirm payload can be large** (up to 1000 parsed rows).
  `experimental.serverActions.bodySizeLimit` is `2mb` in `next.config.ts`.
- **`ImportForm.tsx` is one client component** (dropzone + review + pickers).
  Fine at current size; split if the review table grows.

## Suggested order (whole file)

Identity 1 → identity 2–3, then whichever of: Wikidata-on-import (or a
follow-up resolve action), re-match on commit, ISBN fill-in / Open Library,
title/name normalization (A7c), StoryGraph parser in the dropzone. Split-author
script only when a collision is sitting in prod.
