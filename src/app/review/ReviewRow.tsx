"use client";

import { useState, useTransition } from "react";
import type { ReviewAuthor } from "@/lib/review";
import styles from "./page.module.css";

interface Props {
  author: ReviewAuthor;
  countries: { iso3: string; name: string }[];
  onSave: (authorId: string, iso3s: string[]) => Promise<void>;
}

export default function ReviewRow({ author, countries, onSave }: Props) {
  // An author can be assigned several countries — collect them as chips before saving.
  const [chosen, setChosen] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (saved) return null; // drop the row once its countries are saved

  const nameFor = (iso3: string) =>
    countries.find((c) => c.iso3 === iso3)?.name ?? iso3;

  const add = (iso3: string) => {
    if (iso3 && !chosen.includes(iso3)) setChosen([...chosen, iso3]);
  };

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
        {chosen.length > 0 && (
          <div className={styles.chips}>
            {chosen.map((iso3) => (
              <button
                key={iso3}
                type="button"
                className={styles.chip}
                onClick={() => setChosen(chosen.filter((c) => c !== iso3))}
                aria-label={`Remove ${nameFor(iso3)}`}
              >
                {nameFor(iso3)} ✕
              </button>
            ))}
          </div>
        )}
        <select
          className={styles.select}
          value=""
          onChange={(e) => add(e.target.value)}
          aria-label={`Add country for ${author.name}`}
        >
          <option value="">Add country…</option>
          {countries
            .filter((c) => !chosen.includes(c.iso3))
            .map((c) => (
              <option key={c.iso3} value={c.iso3}>
                {c.name}
              </option>
            ))}
        </select>
        <button
          className={styles.save}
          disabled={chosen.length === 0 || pending}
          onClick={() =>
            startTransition(async () => {
              await onSave(author.id, chosen);
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
