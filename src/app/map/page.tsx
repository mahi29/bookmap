import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getMapEntries,
  getNeedsReviewCount,
} from "@/domains/coverage/map-query";
import { getSession } from "@/infrastructure/auth/dal";
import { logout } from "../actions";
import MapView from "../MapView";
import styles from "./page.module.css";

export default async function MapPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const [entries, needsReviewCount] = await Promise.all([
    getMapEntries(session.userId),
    getNeedsReviewCount(),
  ]);

  return (
    <main className={styles.main}>
      <header className={styles.hero}>
        <div className={styles.userRow}>
          <span className={styles.eyebrow}>BookMap</span>
          <form action={logout} className={styles.logoutForm}>
            <span className={styles.username}>{session.username}</span>
            <button className={styles.logout}>Log out</button>
          </form>
        </div>
        <h1 className={styles.title}>A map of what you&apos;ve read.</h1>
        <Link className={styles.addLink} href="/add">
          + Add a reading
        </Link>
      </header>
      <MapView entries={entries} needsReviewCount={needsReviewCount} />
    </main>
  );
}
