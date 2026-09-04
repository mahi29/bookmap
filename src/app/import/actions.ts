"use server";

import { revalidatePath } from "next/cache";
import {
  previewCsvImport,
  commitCsvImport,
  loadImportCatalog,
} from "@/domains/reading-log/import-service";
import {
  applyUserResolution,
  type ReadyMatch,
  type ParsedImportRow,
  type UserResolution,
} from "@/domains/reading-log/import-matching";
import type { ImportPreview } from "@/domains/reading-log/import-service";
import { verifySession } from "@/infrastructure/auth/dal";

export type PreviewState =
  | { ok: false; error: string }
  | { ok: true; filename: string; preview: ImportPreview };

export type CommitState =
  | { ok: false; error: string }
  | { ok: true; imported: number; skippedDup: number };

function safeFilename(name: string): string {
  return name.replace(/^.*[\\/]/, "").slice(0, 200) || "import.csv";
}

export async function previewImportAction(
  csvText: string,
  filename: string,
): Promise<PreviewState> {
  const session = await verifySession();
  const result = await previewCsvImport(csvText, session.userId);
  if (!result.ok) return result;
  return {
    ok: true,
    filename: safeFilename(filename),
    preview: result.preview,
  };
}

export async function commitImportAction(
  filename: string,
  ready: ReadyMatch[],
  resolved: { row: ParsedImportRow; resolution: UserResolution }[],
): Promise<CommitState> {
  const session = await verifySession();
  const catalog = await loadImportCatalog(session.userId);

  const items = [...ready];
  for (const { row, resolution } of resolved) {
    const applied = applyUserResolution(row, resolution, catalog);
    if (!applied.ok) {
      return { ok: false, error: `Line ${row.line}: ${applied.error}` };
    }
    items.push({ row, plan: applied.plan });
  }

  if (items.length === 0) {
    return { ok: false, error: "Nothing to import." };
  }

  const result = await commitCsvImport(
    session.userId,
    safeFilename(filename),
    items,
  );
  revalidatePath("/");
  return { ok: true, ...result };
}
