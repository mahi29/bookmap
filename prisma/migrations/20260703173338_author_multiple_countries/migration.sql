-- CreateTable: an author can hold several map countries (citizenships).
CREATE TABLE "AuthorCountry" (
    "authorId" TEXT NOT NULL,
    "iso3" TEXT NOT NULL,
    CONSTRAINT "AuthorCountry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("authorId", "iso3")
);

-- Preserve existing manual country picks before the column is dropped.
INSERT INTO "AuthorCountry" ("authorId", "iso3")
SELECT "id", "resolvedCountryIso3" FROM "Author"
WHERE "resolutionMethod" = 'manual' AND "resolvedCountryIso3" IS NOT NULL;

-- Drop Author.resolvedCountryIso3 (SQLite table redefinition).
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Author" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "wikidataId" TEXT,
    "birthCountryIso3" TEXT,
    "resolutionMethod" TEXT NOT NULL DEFAULT 'unresolved',
    "confidence" REAL,
    "reasoning" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME
);
INSERT INTO "new_Author" ("id", "name", "wikidataId", "birthCountryIso3", "resolutionMethod", "confidence", "reasoning", "needsReview", "resolvedAt")
SELECT "id", "name", "wikidataId", "birthCountryIso3", "resolutionMethod", "confidence", "reasoning", "needsReview", "resolvedAt" FROM "Author";
DROP TABLE "Author";
ALTER TABLE "new_Author" RENAME TO "Author";
CREATE UNIQUE INDEX "Author_name_key" ON "Author"("name");
PRAGMA foreign_keys=ON;
