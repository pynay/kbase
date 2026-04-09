/**
 * staleness.ts — Detect stale knowledge entries via git.
 *
 * A knowledge entry becomes "stale" when any of the source files it
 * references have been modified after the entry was written.
 */

import type { KnowledgeEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StaleFile {
  filePath: string;
  fileModified: string; // ISO 8601
  daysSinceEntry: number;
}

export interface StaleEntry {
  entryPath: string;
  entrySummary: string;
  entryTimestamp: string;
  staleFiles: StaleFile[];
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Find the git repository root from a starting directory.
 */
export function getRepoRoot(startDir: string): string | null {
  throw new Error("Not implemented");
}

/**
 * Check a single entry for staleness by comparing file commit dates
 * against the entry timestamp.
 */
export function checkStaleness(
  entry: KnowledgeEntry,
  entryPath: string,
  repoRoot: string
): StaleEntry | null {
  throw new Error("Not implemented");
}

/**
 * Check all entries for staleness. Returns stale entries sorted by
 * largest staleness gap first.
 */
export function checkAllStaleness(
  entries: Array<{ entry: KnowledgeEntry; path: string }>,
  repoRoot: string
): StaleEntry[] {
  throw new Error("Not implemented");
}
