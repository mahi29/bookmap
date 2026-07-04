import Link from "next/link";
import AuthForm from "../AuthForm";
import { signupAction } from "../actions";
import styles from "../auth.module.css";

export default function SignupPage() {
  return (
    <main className={styles.main}>
      <header>
        <span className={styles.eyebrow}>BookMap</span>
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.pitch}>
          Log the books you read and build your own map of the world&apos;s
          authors.
        </p>
      </header>
      <AuthForm
        action={signupAction}
        submitLabel="Sign up"
        pendingLabel="Signing up…"
        autoCompletePassword="new-password"
      />
      <p className={styles.switch}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
