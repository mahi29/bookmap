"use client";

import { useState, useTransition } from "react";
import type { ReviewAuthor } from "@/lib/review";
import styles from "./page.module.css";

interface Props {
  author: ReviewAuthor;
  countries: { iso3: string; name: string }[];
  onSave: (authorId: string, iso3: string) => Promise<void>;
}

export default function ReviewRow({ author, countries, onSave }: Props) {
  const [iso3, setIso3] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Drop the row from the list once its country is saved.
  if (saved) return null;

  return (
    <li className={styles.row}>
      <div className={styles.info}>
        <span className={styles.name}>{author.name}</span>
        <span className={styles.books}>
          {author.books.slice(0, 3).join(" · ") || "—"}
        </span>
        {author.reasoning && (
          <span className={styles.reason}>{author.reasoning}</span>
        )}
      </div>
      <div className={styles.actions}>
        <select
          className={styles.select}
          value={iso3}
          onChange={(e) => setIso3(e.target.value)}
          aria-label={`Country for ${author.name}`}
        >
          <option value="">Select country…</option>
          {countries.map((c) => (
            <option key={c.iso3} value={c.iso3}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          className={styles.save}
          disabled={!iso3 || pending}
          onClick={() =>
            startTransition(async () => {
              await onSave(author.id, iso3);
              setSaved(true);
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </li>
  );
}
