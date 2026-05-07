/**
 * index.ts — Build and query _graph/ indexes.
 *
 * The _graph/ directory contains derived JSON indexes built from the
 * knowledge entry markdown files for fast lookups. All four indexes are
 * derived from the same set of entries in a single pass to keep
 * consistency and avoid redundant I/O.
 */
import type { KnowledgeEntry, DependencyIndex, AssumptionIndex, ModuleIndex, FileIndex } from "./types.js";
/**
 * Build all four _graph/ indexes from parsed entries and write them to disk.
 *
 * Single-pass accumulation:
 *   1. modules.json   — module name → [entry IDs]
 *   2. files.json     — file path → [entry IDs]
 *   3. dependencies.json — module → { depends_on, depended_on_by }
 *   4. assumptions.json  — module → [{ assumption, entry_id }]
 *
 * `depends_on` and `affects` are treated as dual declarations of the
 * same underlying edge: "X affects Y" is equivalent to "Y depends_on X".
 * Whichever side an entry writer chose, the graph ends up with the same
 * edge, and an edge declared from both sides collapses to one (not two)
 * via the .includes() dedup guards below.
 *
 * If `entries` is not provided, reads them from disk via readAllEntries().
 */
export declare function buildIndexes(knowledgeDir: string, entries?: KnowledgeEntry[]): Promise<void>;
/**
 * Read the dependencies.json index (module dependency graph).
 */
export declare function getDependencies(knowledgeDir: string): Promise<DependencyIndex>;
/**
 * Read the assumptions.json index (assumptions grouped by module).
 */
export declare function getAssumptions(knowledgeDir: string): Promise<AssumptionIndex>;
/**
 * Read the modules.json index (module name to entry IDs).
 */
export declare function getModules(knowledgeDir: string): Promise<ModuleIndex>;
/**
 * Read the files.json index (file path to entry IDs).
 */
export declare function getFiles(knowledgeDir: string): Promise<FileIndex>;
/**
 * Rebuild every derived artifact from the current knowledge entries:
 * the four _graph/ JSON indexes plus the human-readable index.md.
 *
 * Single source of truth for "what counts as a full rebuild" — callers
 * (write_knowledge, kb reindex) all route through this, so adding a
 * future derived artifact means updating one function, not N call sites.
 *
 * Reads entries once and passes them through to both stages to avoid a
 * second disk walk.
 */
export declare function rebuildAll(knowledgeDir: string, entries?: KnowledgeEntry[]): Promise<void>;
/**
 * Regenerate .knowledge/index.md — a human-readable (and LLM-scannable)
 * overview of the knowledge base.
 *
 * Format follows the spec in CLAUDE.md:
 *   - Header: title, last-updated timestamp, total entries, module count
 *   - ## Modules — grouped list, newest entry first within each module,
 *                  each line is `summary (YYYY-MM-DD) — \`id\``
 *   - ## Assumptions (all) — flat roll-up of every assumption across
 *                  every entry, prefixed with its module
 *
 * The entry id on each line is kept (the spec example doesn't show it,
 * but it's useful for read_knowledge target lookups — an agent scanning
 * this file can jump directly from summary to fetch-by-id).
 *
 * Sort order:
 *   - Modules: alphabetical, for stable diffs.
 *   - Entries within a module: newest-first by timestamp, so the most
 *     recent decisions float to the top of each section.
 *   - Assumptions: grouped by module alphabetically, preserving the
 *     order entries are emitted within a module.
 */
export declare function generateIndexMd(knowledgeDir: string, entries?: KnowledgeEntry[]): Promise<void>;
//# sourceMappingURL=index.d.ts.map