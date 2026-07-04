-- Reading and Import become per-user. Existing rows are backfilled to a bootstrap
-- "mahith" user created here with the LOCKED sentinel hash (can never log in until
-- `npm run db:set-password -- mahith <password>` replaces it). Hand-edited from the
-- Prisma-generated draft: columns are added NULLABLE, backfilled, then tightened to
-- NOT NULL, so this applies cleanly to a live database. Repeatable verbatim against
-- the production branch; ON CONFLICT keeps it safe if a real "mahith" account
-- already exists there (rows then backfill to that account).

-- AlterTable (nullable first; SET NOT NULL after backfill)
ALTER TABLE "Import" ADD COLUMN     "userId" TEXT;
ALTER TABLE "Reading" ADD COLUMN     "userId" TEXT;

-- Bootstrap user + backfill
INSERT INTO "User" ("id", "username", "passwordHash", "createdAt")
VALUES ('c4c41c2949fb3aaa56d46eb2a', 'mahith', 'LOCKED', CURRENT_TIMESTAMP)
ON CONFLICT ("username") DO NOTHING;

UPDATE "Reading" SET "userId" = (SELECT "id" FROM "User" WHERE "username" = 'mahith')
WHERE "userId" IS NULL;

UPDATE "Import" SET "userId" = (SELECT "id" FROM "User" WHERE "username" = 'mahith')
WHERE "userId" IS NULL;

ALTER TABLE "Reading" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Import" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "BookAuthor_authorId_idx" ON "BookAuthor"("authorId");

-- CreateIndex
CREATE INDEX "Reading_bookId_idx" ON "Reading"("bookId");

-- CreateIndex
CREATE INDEX "Reading_userId_dateRead_idx" ON "Reading"("userId", "dateRead");

-- AddForeignKey
ALTER TABLE "Reading" ADD CONSTRAINT "Reading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
