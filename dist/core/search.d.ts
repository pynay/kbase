/**
 * search.ts — Substring matching primitives shared across transports.
 *
 * The CLI's `kb search` and the MCP `read_knowledge` tool both need the
 * same field-ordered, case-insensitive substring matcher. Lifting it
 * here keeps their behavior in lockstep — a change to field priority or
 * snippet shape affects both surfaces at once.
 */
import type { KnowledgeEntry } from "./types.js";
export interface SearchHit {
    entry: KnowledgeEntry;
    field: string;
    snippet: string;
}
/**
 * Return true if `haystack` contains `needleLower` (case-insensitive).
 * `needleLower` is expected to already be lowercased by the caller so
 * the inner loop doesn't redo the work per entry.
 */
export declare function contains(haystack: string, needleLower: string): boolean;
/**
 * Extract a short snippet around the first match of `needleLower` in `text`.
 * Falls back to the truncated start of the text if the match isn't found
 * (which happens when the match came from a list field joined elsewhere).
 */
export declare function makeSnippet(text: string, needleLower: string, width?: number): string;
/**
 * Check one entry for a match and, if found, return a SearchHit describing
 * the first field that hit. Field order is tuned to prefer the most
 * "summary-like" fields so the snippet is maximally informative.
 */
export declare function matchEntry(entry: KnowledgeEntry, needleLower: string): SearchHit | null;
//# sourceMappingURL=search.d.ts.map