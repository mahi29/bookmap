"use client";

import Link from "next/link";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import {
  commitImportAction,
  previewImportAction,
  type CommitState,
  type PreviewState,
} from "./actions";
import type {
  AmbiguousMatch,
  UserResolution,
} from "@/domains/reading-log/import-matching";
import styles from "./page.module.css";

type Resolutions = Record<number, UserResolution>;

function rowLabel(match: AmbiguousMatch): string {
  const { row } = match;
  const title = row.title ?? row.isbn ?? `line ${row.line}`;
  const author = row.authors.length ? ` · ${row.authors.join(", ")}` : "";
  const date = row.dateRead ? ` · ${row.dateRead}` : "";
  return `Line ${row.line}: ${title}${author}${date}`;
}

function AmbiguousPicker({
  match,
  value,
  onChange,
}: {
  match: AmbiguousMatch;
  value: UserResolution | undefined;
  onChange: (resolution: UserResolution) => void;
}) {
  const createAuthors =
    value?.type === "create" ? value.authors : match.row.authors.join(", ");

  return (
    <fieldset className={styles.ambiguous}>
      <legend className={styles.ambiguousTitle}>{rowLabel(match)}</legend>
      <p className={styles.hint}>{match.reason}</p>
      {match.kind === "book"
        ? match.candidates.map((candidate) => (
            <label key={candidate.id} className={styles.choice}>
              <input
                type="radio"
                name={`row-${match.row.line}`}
                checked={
                  value?.type === "useBook" && value.bookId === candidate.id
                }
                onChange={() =>
                  onChange({ type: "useBook", bookId: candidate.id })
                }
              />
              <span>
                {candidate.title}
                {candidate.authors.length
                  ? ` — ${candidate.authors.join(", ")}`
                  : ""}
                {candidate.isbn ? ` (${candidate.isbn})` : ""}
              </span>
            </label>
          ))
        : match.candidates.map((candidate) => (
            <label key={candidate.id} className={styles.choice}>
              <input
                type="radio"
                name={`row-${match.row.line}`}
                checked={
                  value?.type === "useAuthor" && value.authorId === candidate.id
                }
                onChange={() =>
                  onChange({ type: "useAuthor", authorId: candidate.id })
                }
              />
              <span>{candidate.name}</span>
            </label>
          ))}
      {match.row.title && (
        <label className={styles.choice}>
          <input
            type="radio"
            name={`row-${match.row.line}`}
            checked={value?.type === "create"}
            onChange={() =>
              onChange({
                type: "create",
                authors: createAuthors,
              })
            }
          />
          <span className={styles.createNew}>
            Create as a new book, author
            <input
              className={styles.inlineInput}
              value={createAuthors}
              placeholder="Required"
              onChange={(event) =>
                onChange({ type: "create", authors: event.target.value })
              }
              onFocus={() =>
                onChange({ type: "create", authors: createAuthors })
              }
            />
          </span>
        </label>
      )}
    </fieldset>
  );
}

export default function ImportForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [resolutions, setResolutions] = useState<Resolutions>({});
  const [commitResult, setCommitResult] = useState<CommitState | null>(null);
  const [pending, startTransition] = useTransition();

  const previewData = preview?.ok ? preview.preview : null;
  const filename = preview?.ok ? preview.filename : "";

  const unresolved = useMemo(() => {
    if (!previewData) return [];
    return previewData.ambiguous.filter((item) => !resolutions[item.row.line]);
  }, [previewData, resolutions]);

  const canCommit =
    !!previewData &&
    unresolved.length === 0 &&
    (previewData.ready.length > 0 || previewData.ambiguous.length > 0);

  const loadFile = useCallback((file: File) => {
    setCommitResult(null);
    setResolutions({});
    setPreview(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      startTransition(async () => {
        const result = await previewImportAction(text, file.name);
        setPreview(result);
      });
    };
    reader.readAsText(file);
  }, []);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) loadFile(file);
  }

  function commit() {
    if (!previewData || !canCommit) return;
    const resolved = previewData.ambiguous.flatMap((item) => {
      const resolution = resolutions[item.row.line];
      return resolution ? [{ row: item.row, resolution }] : [];
    });
    startTransition(async () => {
      const result = await commitImportAction(
        filename,
        previewData.ready,
        resolved,
      );
      setCommitResult(result);
      if (result.ok) {
        setPreview(null);
        setResolutions({});
      }
    });
  }

  function reset() {
    setPreview(null);
    setResolutions({});
    setCommitResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={styles.panel}>
      <label
        className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          className={styles.fileInput}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) loadFile(file);
          }}
        />
        <span className={styles.dropLabel}>
          {pending && !preview
            ? "Reading CSV…"
            : "Drop a CSV here, or click to choose"}
        </span>
        <span className={styles.dropHint}>
          Columns: title or isbn, optional author, optional date read
          (YYYY-MM-DD or YYYY/MM/DD). First 1000 rows are kept.
        </span>
      </label>

      {preview && !preview.ok && (
        <p className={styles.error}>{preview.error}</p>
      )}

      {previewData && (
        <div className={styles.review}>
          <h2 className={styles.sectionTitle}>Review {filename}</h2>
          {previewData.trimmed > 0 && (
            <p className={styles.warn}>
              Kept the first 1000 rows; {previewData.trimmed} more were ignored.
            </p>
          )}
          <ul className={styles.counts}>
            <li>{previewData.ready.length} ready</li>
            <li>{previewData.ambiguous.length} need a choice</li>
            <li>{previewData.duplicates.length} already imported</li>
            <li>{previewData.incomplete.length} incomplete</li>
            <li>{previewData.invalid.length} invalid</li>
          </ul>

          {previewData.ready.some((item) => item.plan.warnings.length > 0) && (
            <ul className={styles.warnings}>
              {previewData.ready.flatMap((item) =>
                item.plan.warnings.map((warning) => (
                  <li key={`${item.row.line}-${warning}`}>
                    Line {item.row.line}: {warning}
                  </li>
                )),
              )}
            </ul>
          )}

          {previewData.ambiguous.map((item) => (
            <AmbiguousPicker
              key={item.row.line}
              match={item}
              value={resolutions[item.row.line]}
              onChange={(resolution) =>
                setResolutions((current) => ({
                  ...current,
                  [item.row.line]: resolution,
                }))
              }
            />
          ))}

          {previewData.incomplete.length > 0 && (
            <section>
              <h3 className={styles.subhead}>Incomplete (not imported)</h3>
              <ul className={styles.list}>
                {previewData.incomplete.map((item) => (
                  <li key={item.row.line}>
                    Line {item.row.line}
                    {item.row.title ? ` · ${item.row.title}` : ""}
                    {item.row.isbn ? ` · ${item.row.isbn}` : ""} — {item.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {previewData.invalid.length > 0 && (
            <section>
              <h3 className={styles.subhead}>Invalid (not imported)</h3>
              <ul className={styles.list}>
                {previewData.invalid.map((item) => (
                  <li key={item.line}>
                    Line {item.line} — {item.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className={styles.actions}>
            <button
              className={styles.submit}
              type="button"
              disabled={!canCommit || pending}
              onClick={commit}
            >
              {pending ? "Importing…" : "Confirm import"}
            </button>
            <button
              className={styles.secondary}
              type="button"
              onClick={reset}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
          {unresolved.length > 0 && (
            <p className={styles.hint}>
              Resolve {unresolved.length} ambiguous row
              {unresolved.length === 1 ? "" : "s"} before importing.
            </p>
          )}
        </div>
      )}

      {commitResult?.ok && (
        <p className={styles.success}>
          Imported {commitResult.imported} reading
          {commitResult.imported === 1 ? "" : "s"}
          {commitResult.skippedDup
            ? ` · skipped ${commitResult.skippedDup} duplicate${commitResult.skippedDup === 1 ? "" : "s"}`
            : ""}
          .{" "}
          <Link className={styles.inlineLink} href="/">
            Back to map
          </Link>
        </p>
      )}
      {commitResult && !commitResult.ok && (
        <p className={styles.error}>{commitResult.error}</p>
      )}
    </div>
  );
}
