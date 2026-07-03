@AGENTS.md

# BookMap

A personal reading tracker whose signature feature is a **choropleth world map** shading
each country by how much the user has read from authors of that nationality. Single-user
for now (no auth). See the full plan and ubiquitous language in
`~/.claude/plans/i-want-to-build-recursive-puddle.md`.

## Ubiquitous language

- **Book** — a title with one or more Authors.
- **Author** — resolved to exactly **one** _map country_ (ISO 3166-1 alpha-3), defined as
  country of citizenship.
- **Reading** — an event: "user finished Book on date X." Carries the date; all date-range
  filtering hangs off Readings.
- **Coverage** — distinct map countries in the user's Readings for a date range.
- **Intensity** — count of books attributable to a country (drives map shading).
- **Review queue** — authors whose country couldn't be resolved confidently.

## Engineering conventions (non-negotiable)

- **TDD.** Write a failing test first, make it pass, then refactor (red → green → refactor).
  Especially for CSV parsing, the nationality tiebreak/successor logic, and aggregation.
  Test runner: Vitest (`npm test`).
- **Verify in the browser.** Every UI change must be run locally and checked via the Preview
  MCP (screenshot + inspect) before it's considered done — passing tests is not enough.
- **Separation of concerns.** Keep layers distinct:
  - `src/app/**` — React components (presentation) + route handlers/server actions
    (thin orchestration only).
  - `src/lib/**` — the domain layer: parsing, nationality resolution, aggregation. Pure,
    framework-free, unit-tested. No React, no `next/*` imports here.
  - `src/lib/db.ts` — the single Prisma client instance. Data access lives close to it.
  - No file mixes JSX + business logic + DB queries. Styling stays in Tailwind/CSS
    Modules, not sprawling inline styles in logic files.
- **Pragmatic, not over-engineered.** Prefer the simplest thing that works. Introduce an
  abstraction only when there's a second real caller. No speculative frameworks. Readability
  over cleverness.
- **Typed and linted.** Strict TypeScript; `npm run lint` and `npm run format` clean before
  a change is done. Avoid `any` — if unavoidable, add a comment justifying it.

## Commands

- `npm run dev` — start the dev server (localhost).
- `npm test` — run the test suite once. `npm run test:watch` — watch mode.
- `npm run lint` / `npm run format` — ESLint / Prettier.
- `npm run db:migrate` — create/apply a Prisma migration. `npm run db:generate` — regen client.
- `npm run db:seed` — populate the DB from a StoryGraph CSV (see `scripts/seed.ts`).

## Version note

This project uses **Next.js 16** and **Prisma 7**, both newer than most training data. Their
APIs differ from older versions — consult the bundled docs in `node_modules/next/dist/docs/`
and the Prisma package docs before writing framework code rather than assuming older patterns.
