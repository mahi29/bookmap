"use client";

import { useActionState } from "react";
import type { AuthFormState } from "./actions";
import styles from "./auth.module.css";

const INITIAL: AuthFormState = { message: "" };

interface AuthFormProps {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  pendingLabel: string;
  autoCompletePassword: "current-password" | "new-password";
}

export default function AuthForm({
  action,
  submitLabel,
  pendingLabel,
  autoCompletePassword,
}: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Username</span>
        <input
          className={styles.input}
          name="username"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <input
          className={styles.input}
          type="password"
          name="password"
          required
          autoComplete={autoCompletePassword}
        />
      </label>

      <button className={styles.submit} disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </button>

      {state.message && <p className={styles.error}>{state.message}</p>}
    </form>
  );
}
