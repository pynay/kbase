/**
 * store.ts — Read/write .knowledge/ markdown files.
 *
 * Persistence layer for knowledge entries stored as markdown files
 * with YAML frontmatter in .knowledge/.
 */
import type { KnowledgeEntry } from "./types.js";
/**
 * Walk up from `startDir` (default: cwd) to find the nearest .knowledge/
 * directory. Returns the absolute path, or null if not found.
 *
 * Uses fs.stat in a loop — no shell spawning. Stops at the filesystem root
 * to avoid an infinite loop.
 */
export declare function findKnowledgeDir(startDir?: string): Promise<string | null>;
/**
 * Parse a single markdown file (with YAML frontmatter) into a KnowledgeEntry.
 *
 * Uses gray-matter for frontmatter extraction, then splits the remaining
 * markdown body on H2 headings to populate decision, alternatives,
 * assumptions, and risk fields.
 */
export declare function parseEntry(filePath: string, raw: string): KnowledgeEntry;
/**
 * Serialize a KnowledgeEntry to a markdown string with YAML frontmatter.
 *
 * Frontmatter contains identity, code-mapping, and metadata fields.
 * Body contains narrative sections as ## headings.
 */
export declare function serializeEntry(entry: KnowledgeEntry): string;
/**
 * Read and parse a single entry file from disk.
 */
export declare function readEntry(filePath: string): Promise<KnowledgeEntry>;
/**
 * List all entry .md file paths in .knowledge/, excluding internal dirs
 * (_graph, _cache) and internal top-level files (index.md). Uses
 * fast-glob for efficient recursive matching.
 *
 * The ignore list mixes directory-glob patterns with specific file
 * paths because index.md is a single file at the root and needs an
 * exact-path ignore rather than a dir-wildcard.
 */
export declare function listEntryPaths(knowledgeDir: string): Promise<string[]>;
/**
 * Read and parse all entries from .knowledge/.
 */
export declare function readAllEntries(knowledgeDir: string): Promise<KnowledgeEntry[]>;
/**
 * Write a new knowledge entry to disk. Returns the file path and generated ID.
 *
 * Files are organized by module: .knowledge/<module>/<id>.md
 * A UUID is generated for the ID, and the current ISO timestamp is stamped.
 */
export declare function writeEntry(knowledgeDir: string, entry: Omit<KnowledgeEntry, "id" | "timestamp" | "agent"> & {
    agent?: string;
}): Promise<{
    path: string;
    id: string;
}>;
/**
 * Schema-level quality floor for knowledge entry decisions.
 * Throws if the decision text is below the minimum length.
 */
export declare function validateDecisionLength(decision: string, minLen?: number): void;
//# sourceMappingURL=store.d.ts.map