/**
 * staleness.ts — Detect stale knowledge entries via git.
 *
 * A knowledge entry becomes "stale" when any of the source files it
 * references have been modified after the entry was written.
 *
 * We ask git (not the filesystem) for the last-modified date so that
 * `git checkout` / `git clone` — which rewrite mtimes — don't produce
 * false positives. Commit timestamps are the authoritative signal for
 * "when did this code actually change."
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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
// Git helpers
// ---------------------------------------------------------------------------

/**
 * Find the git repository root from a starting directory.
 *
 * Walks upward looking for a `.git` entry. We accept both a directory
 * (normal clone) and a file (git worktrees and submodules write a `.git`
 * file pointing at the real gitdir), so this works inside worktrees —
 * which is exactly where kbase is being developed.
 */
export function getRepoRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, ".git");
    try {
      // existsSync is fine here: we just need a boolean, and `fs.stat`
      // would be noisier with try/catch for what is a one-shot check.
      if (fs.existsSync(candidate)) return dir;
    } catch {
      // ignore and keep climbing
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

/**
 * Return the last commit timestamp (ISO 8601) for a single file, or null
 * if git has no record of it (untracked, deleted, renamed, etc.).
 *
 * Uses execFileSync in argv form — never a shell string — so file paths
 * containing spaces or shell metacharacters can't be misinterpreted.
 */
function lastCommitDate(repoRoot: string, relPath: string): string | null {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", relPath],
      { cwd: repoRoot, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return out.length > 0 ? out : null;
  } catch {
    // git not installed, not a repo, or file unknown — treat as "no info"
    return null;
  }
}

// ---------------------------------------------------------------------------
// Staleness checks
// ---------------------------------------------------------------------------

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Check a single entry for staleness by comparing file commit dates
 * against the entry timestamp.
 *
 * Returns null when the entry has no timestamp (nothing to compare against)
 * or when no referenced files were modified after the entry was written.
 */
export function checkStaleness(
  entry: KnowledgeEntry,
  entryPath: string,
  repoRoot: string
): StaleEntry | null {
  if (!entry.timestamp) return null;

  const entryMs = Date.parse(entry.timestamp);
  if (Number.isNaN(entryMs)) return null;

  const staleFiles: StaleFile[] = [];

  for (const file of entry.files ?? []) {
    // Entry files are stored relative to the repo root in practice, but
    // be defensive: if an absolute path slips in, make it relative so
    // `git log --` resolves correctly.
    const rel = path.isAbsolute(file)
      ? path.relative(repoRoot, file)
      : file;

    const committed = lastCommitDate(repoRoot, rel);
    if (!committed) continue;

    const commitMs = Date.parse(committed);
    if (Number.isNaN(commitMs)) continue;

    if (commitMs > entryMs) {
      staleFiles.push({
        filePath: rel,
        fileModified: committed,
        daysSinceEntry: Math.floor((commitMs - entryMs) / MS_PER_DAY),
      });
    }
  }

  if (staleFiles.length === 0) return null;

  // Worst-offender first within an entry — helps the human eye.
  staleFiles.sort((a, b) => b.daysSinceEntry - a.daysSinceEntry);

  return {
    entryPath,
    entrySummary: entry.summary,
    entryTimestamp: entry.timestamp,
    staleFiles,
  };
}

/**
 * Check all entries for staleness. Returns stale entries sorted by
 * largest staleness gap first, so `kb stale` surfaces the most rotten
 * decisions at the top.
 */
export function checkAllStaleness(
  entries: Array<{ entry: KnowledgeEntry; path: string }>,
  repoRoot: string
): StaleEntry[] {
  const results: StaleEntry[] = [];
  for (const { entry, path: entryPath } of entries) {
    const stale = checkStaleness(entry, entryPath, repoRoot);
    if (stale) results.push(stale);
  }

  // Sort by the worst file in each entry, descending.
  results.sort((a, b) => {
    const aMax = a.staleFiles[0]?.daysSinceEntry ?? 0;
    const bMax = b.staleFiles[0]?.daysSinceEntry ?? 0;
    return bMax - aMax;
  });

  return results;
}
