"use client";

import { useActionState } from "react";
import { createReading, type AddReadingState } from "./actions";
import styles from "./page.module.css";

const INITIAL: AddReadingState = { ok: false, message: "" };

export default function AddReadingForm() {
  const [state, formAction, pending] = useActionState(createReading, INITIAL);

  return (
    <form action={formAction} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Title</span>
        <input
          className={styles.input}
          name="title"
          required
          autoComplete="off"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Author(s)</span>
        <input
          className={styles.input}
          name="authors"
          placeholder="Comma-separated, e.g. Neil Gaiman, Terry Pratchett"
          required
          autoComplete="off"
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Date read</span>
          <input className={styles.input} type="date" name="dateRead" />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Rating</span>
          <input
            className={styles.input}
            type="number"
            name="rating"
            min="0"
            max="5"
            step="0.5"
            placeholder="0–5"
          />
        </label>
      </div>

      <button className={styles.submit} disabled={pending}>
        {pending ? "Adding…" : "Add reading"}
      </button>

      {state.message && (
        <p className={state.ok ? styles.success : styles.error}>
          {state.message}
        </p>
      )}
    </form>
  );
}
