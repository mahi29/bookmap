"use client";

import { useEffect, useRef, useState } from "react";
import type { CountryBook } from "@/domains/coverage/coverage-service";
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
  const closeRef = useRef<HTMLButtonElement>(null);
  if (country !== null && country !== shown) setShown(country);

  const open = country !== null;
  const data = country ?? shown;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside
      className={`${styles.panel} ${open ? styles.open : ""}`}
      role="dialog"
      aria-modal={open}
      aria-labelledby="country-panel-name"
      aria-hidden={!open}
    >
      {data && (
        <>
          <header className={styles.header}>
            <div>
              <h2 className={styles.name} id="country-panel-name">
                {data.name}
              </h2>
              <span className={styles.count}>
                {data.books.length} {data.books.length === 1 ? "book" : "books"}
              </span>
            </div>
            <button
              ref={closeRef}
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
