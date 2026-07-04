import Link from "next/link";
import { allMapCountries } from "@/lib/countries";
import { getReviewQueue } from "@/lib/review";
import { saveAuthorCountries } from "./actions";
import ReviewRow from "./ReviewRow";
import styles from "./page.module.css";

export default async function ReviewPage() {
  const queue = await getReviewQueue();
  const countries = allMapCountries();

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Review queue</span>
          <h1 className={styles.title}>
            {queue.length} {queue.length === 1 ? "author" : "authors"} to
            resolve
          </h1>
        </div>
        <Link className={styles.back} href="/">
          ← Back to map
        </Link>
      </header>

      {queue.length === 0 ? (
        <p className={styles.empty}>
          Nothing to review — every author has a map country.
        </p>
      ) : (
        <ul className={styles.list}>
          {queue.map((author) => (
            <ReviewRow
              key={author.id}
              author={author}
              countries={countries}
              onSave={saveAuthorCountries}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
