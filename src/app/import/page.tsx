import Link from "next/link";
import ImportForm from "./ImportForm";
import styles from "./page.module.css";

export default function ImportPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>BookMap</span>
          <h1 className={styles.title}>Import CSV</h1>
        </div>
        <Link className={styles.back} href="/">
          ← Back to map
        </Link>
      </header>
      <p className={styles.lede}>
        Drop a CSV with a title or ISBN column. Author and date read are
        optional. Nothing is saved until you confirm.
      </p>
      <ImportForm />
    </main>
  );
}
