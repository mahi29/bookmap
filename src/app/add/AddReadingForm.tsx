"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { isbnStillValid, type BookSearchHit } from "@/domains/book-search/hits";
import { createReading, type AddReadingState } from "./actions";
import styles from "./page.module.css";

const INITIAL: AddReadingState = { ok: false, message: "" };
const SEARCH_DEBOUNCE_MS = 300;

function parseAuthorsField(value: string): string[] {
  return value
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

function formatHit(hit: BookSearchHit): { primary: string; secondary: string } {
  const authors = hit.authors.join(", ");
  const year = hit.year ? ` (${hit.year})` : "";
  const origin = hit.source === "library" ? "in library" : "Google Books";
  return {
    primary: hit.title,
    secondary: `${authors}${year} · ${origin}`,
  };
}

export default function AddReadingForm() {
  const [state, formAction, pending] = useActionState(createReading, INITIAL);
  const listId = useId();

  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [isbn, setIsbn] = useState("");
  const [selected, setSelected] = useState<BookSearchHit | null>(null);

  const [hits, setHits] = useState<BookSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [noMatches, setNoMatches] = useState(false);

  const skipSearchRef = useRef(false);
  const blurTimerRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  function applyIsbnValidity(nextTitle: string, nextAuthors: string) {
    if (!selected) {
      setIsbn("");
      return;
    }
    const still = isbnStillValid(selected, {
      title: nextTitle,
      authors: parseAuthorsField(nextAuthors),
    });
    if (!still) {
      setIsbn("");
      setSelected(null);
    }
  }

  function onTitleChange(value: string) {
    skipSearchRef.current = false;
    setTitle(value);
    applyIsbnValidity(value, authors);
    if (value.trim().length < 2) {
      setHits([]);
      setOpen(false);
      setSearching(false);
      setNoMatches(false);
    } else {
      setSearching(true);
      setNoMatches(false);
    }
  }

  function onAuthorsChange(value: string) {
    setAuthors(value);
    applyIsbnValidity(title, value);
  }

  function pickHit(hit: BookSearchHit) {
    skipSearchRef.current = true;
    setTitle(hit.title);
    setAuthors(hit.authors.join(", "));
    setIsbn(hit.isbn ?? "");
    setSelected(hit);
    setHits([]);
    setOpen(false);
    setActiveIndex(-1);
    setNoMatches(false);
    setSearching(false);
  }

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    const query = title.trim();
    if (query.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/add/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { hits?: BookSearchHit[] };
        const nextHits = data.hits ?? [];
        setHits(nextHits);
        setOpen(true);
        setActiveIndex(nextHits.length > 0 ? 0 : -1);
        setNoMatches(nextHits.length === 0);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [title]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      if (hits.length > 0) setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0 && hits[activeIndex]) {
      event.preventDefault();
      pickHit(hits[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  const showList = open && (hits.length > 0 || searching || noMatches);

  return (
    <form
      action={formAction}
      className={styles.form}
      onBlur={(event) => {
        // Delay so a mousedown on a suggestion can fire before the list unmounts.
        const next = event.relatedTarget as Node | null;
        if (wrapperRef.current?.contains(next)) return;
        if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
        blurTimerRef.current = window.setTimeout(() => setOpen(false), 100);
      }}
    >
      <input type="hidden" name="isbn" value={isbn} />

      <div className={styles.field} ref={wrapperRef}>
        <label className={styles.label} htmlFor="reading-title">
          Title
        </label>
        <input
          id="reading-title"
          className={styles.input}
          name="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={onTitleKeyDown}
          onFocus={() => {
            if (hits.length > 0 || noMatches) setOpen(true);
          }}
          required
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
          }
          placeholder="Title or ISBN"
        />
        {showList && (
          <ul className={styles.suggestions} id={listId} role="listbox">
            {searching && hits.length === 0 && (
              <li className={styles.suggestionStatus} role="status">
                Searching…
              </li>
            )}
            {hits.map((hit, index) => {
              const { primary, secondary } = formatHit(hit);
              const active = index === activeIndex;
              return (
                <li
                  key={`${hit.source}-${hit.isbn ?? hit.title}-${index}`}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={active}
                  className={
                    active ? styles.suggestionActive : styles.suggestion
                  }
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pickHit(hit);
                  }}
                >
                  <span className={styles.suggestionTitle}>{primary}</span>
                  <span className={styles.suggestionMeta}>{secondary}</span>
                </li>
              );
            })}
            {noMatches && !searching && (
              <li className={styles.suggestionStatus} role="status">
                No matches — enter the title and author below.
              </li>
            )}
          </ul>
        )}
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Author(s)</span>
        <input
          className={styles.input}
          name="authors"
          value={authors}
          onChange={(e) => onAuthorsChange(e.target.value)}
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
