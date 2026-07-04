import { prisma } from "../src/lib/db";
import { countryName, resolveToMapCountry } from "../src/lib/countries";

// Directly set an author's map country/countries as a manual pick. For one-off
// corrections; `npx prisma studio` is the GUI equivalent on the AuthorCountry table.
//
//   npm run db:set -- "Yaa Gyasi" GHA USA
//   npm run db:set -- "Kazuo Ishiguro" Japan "United Kingdom"

async function main() {
  const [name, ...codes] = process.argv.slice(2);
  if (!name || codes.length === 0) {
    throw new Error('Usage: npm run db:set -- "Author Name" ISO3 [ISO3 ...]');
  }

  const iso3s = [
    ...new Set(
      codes
        .map((c) => resolveToMapCountry(c))
        .filter((x): x is string => x !== null),
    ),
  ];
  if (iso3s.length === 0) {
    throw new Error(`No valid countries in: ${codes.join(", ")}`);
  }

  const author = await prisma.author.findUnique({ where: { name } });
  if (!author) {
    throw new Error(`Author not found: "${name}"`);
  }

  await prisma.author.update({
    where: { id: author.id },
    data: {
      resolutionMethod: "manual",
      confidence: 1,
      needsReview: false,
      reasoning: "Set manually via db:set",
      resolvedAt: new Date(),
      countries: { deleteMany: {}, create: iso3s.map((iso3) => ({ iso3 })) },
    },
  });

  console.log(
    `${name} → ${iso3s.map((c) => `${c} (${countryName(c) ?? c})`).join(", ")}`,
  );
}

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
