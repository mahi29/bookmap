import Link from "next/link";
import AddReadingForm from "./AddReadingForm";
import styles from "./page.module.css";

export default function AddPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>BookMap</span>
          <h1 className={styles.title}>Add a reading</h1>
        </div>
        <Link className={styles.back} href="/">
          ← Back to map
        </Link>
      </header>
      <AddReadingForm />
    </main>
  );
}
