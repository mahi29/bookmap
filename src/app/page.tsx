import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <span className={styles.eyebrow}>BookMap</span>
      <h1 className={styles.title}>A map of what you&apos;ve read.</h1>
      <p className={styles.subtitle}>
        Import your reading history and watch the world shade in by the
        nationality of the authors behind each book.
      </p>
    </main>
  );
}
