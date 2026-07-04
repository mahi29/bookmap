// Domain string enums. SQLite has no native enums, so these columns are stored as strings;
// these const objects give the valid sets one discoverable home and guard against typos.

export const ResolutionMethod = {
  Wikidata: "wikidata",
  OpenLibrary: "openlibrary",
  Llm: "llm",
  Manual: "manual",
  Unresolved: "unresolved",
} as const;

export type ResolutionMethod =
  (typeof ResolutionMethod)[keyof typeof ResolutionMethod];

export const ReadingSource = {
  StoryGraph: "storygraph",
  Goodreads: "goodreads",
  Manual: "manual",
} as const;

export type ReadingSource = (typeof ReadingSource)[keyof typeof ReadingSource];
