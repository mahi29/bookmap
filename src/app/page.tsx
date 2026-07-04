import Link from "next/link";
import { getMapEntries, getNeedsReviewCount } from "@/lib/map-data";
import MapView from "./MapView";
import styles from "./page.module.css";

export default async function Home() {
  const [entries, needsReviewCount] = await Promise.all([
    getMapEntries(),
    getNeedsReviewCount(),
  ]);

  return (
    <main className={styles.main}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>BookMap</span>
        <h1 className={styles.title}>A map of what you&apos;ve read.</h1>
        <Link className={styles.addLink} href="/add">
          + Add a reading
        </Link>
      </header>
      <MapView entries={entries} needsReviewCount={needsReviewCount} />
    </main>
  );
}
