import {
  countryName,
  resolveToMapCountry,
} from "../src/domains/shared/countries";
import { prisma } from "../src/infrastructure/db/prisma";
import { setManualCountries } from "../src/infrastructure/db/prisma-author-resolution-repository";
import { runScript } from "./shared";

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

  await setManualCountries(author.id, iso3s, {
    reasoning: "Set manually via db:set",
  });

  console.log(
    `${name} → ${iso3s.map((c) => `${c} (${countryName(c) ?? c})`).join(", ")}`,
  );
}

runScript(main);
