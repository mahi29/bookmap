"use client";

import { useState } from "react";
import type { CountryBook } from "@/lib/coverage";
import styles from "./CountryPanel.module.css";

export interface CountryDetail {
  iso3: string;
  name: string;
  books: CountryBook[];
}

interface Props {
  country: CountryDetail | null;
  onClose: () => void;
}

export default function CountryPanel({ country, onClose }: Props) {
  // Retain the last country so content stays put while the panel slides out. Adjusting
  // state during render (guarded) is React's documented way to store prior-render info.
  const [shown, setShown] = useState<CountryDetail | null>(country);
  if (country !== null && country !== shown) setShown(country);

  const open = country !== null;
  const data = country ?? shown;

  return (
    <aside
      className={`${styles.panel} ${open ? styles.open : ""}`}
      aria-hidden={!open}
    >
      {data && (
        <>
          <header className={styles.header}>
            <div>
              <h2 className={styles.name}>{data.name}</h2>
              <span className={styles.count}>
                {data.books.length} {data.books.length === 1 ? "book" : "books"}
              </span>
            </div>
            <button
              className={styles.close}
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </header>

          {data.books.length === 0 ? (
            <p className={styles.empty}>No books from here in this period.</p>
          ) : (
            <ul className={styles.list}>
              {data.books.map((book) => (
                <li key={book.bookId} className={styles.book}>
                  <span className={styles.title}>{book.title}</span>
                  <span className={styles.meta}>
                    {book.authors.join(", ")}
                    {book.dateRead
                      ? ` · ${book.dateRead.toISOString().slice(0, 10)}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
