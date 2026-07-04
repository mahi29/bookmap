import { isValidMapCountry } from "../src/lib/countries";
import { prisma } from "../src/lib/db";
import { getCountryShapes } from "../src/lib/geo";
import { runScript } from "./shared";

// Data-integrity checks over the Author/AuthorCountry tables. Read-only — reports
// problems, doesn't fix them (use db:set, db:resolve, or Prisma Studio for that).
//
//   npm run db:check

let ok = true;

function pass(label: string): void {
  console.log(`✓ ${label}`);
}

function fail(label: string, details: string[]): void {
  ok = false;
  console.log(`✗ ${label}`);
  for (const d of details) console.log(`  - ${d}`);
}

async function main() {
  const authors = await prisma.author.findMany({
    select: {
      id: true,
      name: true,
      needsReview: true,
      countries: { select: { iso3: true } },
    },
  });

  // (a) Every stored iso3 is a valid modern ISO 3166-1 alpha-3 code.
  const invalidIso3: string[] = [];
  for (const author of authors) {
    for (const { iso3 } of author.countries) {
      if (!isValidMapCountry(iso3)) {
        invalidIso3.push(`${author.name}: ${iso3}`);
      }
    }
  }
  if (invalidIso3.length === 0) {
    pass("all stored AuthorCountry.iso3 codes are valid map countries");
  } else {
    fail(
      `${invalidIso3.length} AuthorCountry row(s) have an invalid iso3 code`,
      invalidIso3,
    );
  }

  // (b) Author has >=1 AuthorCountry row IFF needsReview is false.
  const reviewMismatches: string[] = [];
  for (const author of authors) {
    const hasCountries = author.countries.length > 0;
    if (hasCountries && author.needsReview) {
      reviewMismatches.push(
        `${author.name}: has ${author.countries.length} countr${author.countries.length === 1 ? "y" : "ies"} but needsReview=true`,
      );
    } else if (!hasCountries && !author.needsReview) {
      reviewMismatches.push(
        `${author.name}: has no countries but needsReview=false`,
      );
    }
  }
  if (reviewMismatches.length === 0) {
    pass("every author has countries iff needsReview is false");
  } else {
    fail(
      `${reviewMismatches.length} author(s) violate the countries/needsReview invariant`,
      reviewMismatches,
    );
  }

  // (c) Every author falls into exactly one of "resolved with countries" or "needsReview".
  const neither: string[] = [];
  for (const author of authors) {
    const resolvedWithCountries = author.countries.length > 0;
    const inReview = author.needsReview;
    if (!resolvedWithCountries && !inReview) {
      neither.push(`${author.name}: no countries and needsReview=false`);
    }
  }
  if (neither.length === 0) {
    pass(
      "every author is either resolved with countries or in the review queue",
    );
  } else {
    fail(`${neither.length} author(s) fall into neither bucket`, neither);
  }

  // (d) Every distinct iso3 present in AuthorCountry has a renderable map shape.
  const distinctIso3s = [
    ...new Set(authors.flatMap((a) => a.countries.map((c) => c.iso3))),
  ].sort();
  const shapes = getCountryShapes();
  const shapeIso3s = new Set(
    shapes.map((s) => s.iso3).filter((x): x is string => x !== null),
  );
  const missingShapes = distinctIso3s.filter((iso3) => !shapeIso3s.has(iso3));
  if (missingShapes.length === 0) {
    pass("every author-attributed country has a renderable map shape");
  } else {
    fail(
      `${missingShapes.length} author-attributed iso3 code(s) have no map shape`,
      missingShapes,
    );
  }

  console.log(ok ? "\nAll checks passed." : "\nSome checks failed.");
  if (!ok) process.exitCode = 1;
}

runScript(main);
