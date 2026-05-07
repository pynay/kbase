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
import type { KnowledgeEntry } from "./types.js";
export interface StaleFile {
    filePath: string;
    fileModified: string;
    daysSinceEntry: number;
}
export interface StaleEntry {
    entryPath: string;
    entrySummary: string;
    entryTimestamp: string;
    staleFiles: StaleFile[];
}
/**
 * Find the git repository root from a starting directory.
 *
 * Walks upward looking for a `.git` entry. We accept both a directory
 * (normal clone) and a file (git worktrees and submodules write a `.git`
 * file pointing at the real gitdir), so this works inside worktrees —
 * which is exactly where kbase is being developed.
 */
export declare function getRepoRoot(startDir: string): string | null;
/**
 * Check a single entry for staleness by comparing file commit dates
 * against the entry timestamp.
 *
 * Returns null when the entry has no timestamp (nothing to compare against)
 * or when no referenced files were modified after the entry was written.
 */
export declare function checkStaleness(entry: KnowledgeEntry, entryPath: string, repoRoot: string): StaleEntry | null;
/**
 * Check all entries for staleness. Returns stale entries sorted by
 * largest staleness gap first, so `kb stale` surfaces the most rotten
 * decisions at the top.
 */
export declare function checkAllStaleness(entries: Array<{
    entry: KnowledgeEntry;
    path: string;
}>, repoRoot: string): StaleEntry[];
//# sourceMappingURL=staleness.d.ts.map