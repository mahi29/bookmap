import Link from "next/link";
import AuthForm from "../AuthForm";
import { loginAction } from "../actions";
import styles from "../auth.module.css";

export default function LoginPage() {
  return (
    <main className={styles.main}>
      <header>
        <Link className={styles.eyebrow} href="/">
          BookMap
        </Link>
        <h1 className={styles.title}>A map of what you&apos;ve read.</h1>
        <p className={styles.pitch}>
          Track your reading and watch the world fill in, country by country, as
          you read authors from around the globe.
        </p>
      </header>
      <AuthForm
        action={loginAction}
        submitLabel="Log in"
        pendingLabel="Logging in…"
        autoCompletePassword="current-password"
      />
      <p className={styles.switch}>
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </main>
  );
}
