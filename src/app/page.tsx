import Link from "next/link";
import { getCoverageEntries } from "@/lib/map-data";
import { getCountryShapes } from "@/lib/geo";
import { reviewQueueCount } from "@/lib/review";
import MapView from "./MapView";
import styles from "./page.module.css";

export default async function Home() {
  const entries = await getCoverageEntries();
  const shapes = getCountryShapes();
  const toReview = await reviewQueueCount();

  return (
    <main className={styles.main}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>BookMap</span>
        <h1 className={styles.title}>A map of what you&apos;ve read.</h1>
        {toReview > 0 && (
          <Link className={styles.reviewLink} href="/review">
            {toReview} authors need review →
          </Link>
        )}
      </header>
      <MapView shapes={shapes} entries={entries} />
    </main>
  );
}
