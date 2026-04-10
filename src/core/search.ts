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
  field: string;   // which field matched first — used as a snippet label
  snippet: string; // a short context window around the match
}

/**
 * Return true if `haystack` contains `needleLower` (case-insensitive).
 * `needleLower` is expected to already be lowercased by the caller so
 * the inner loop doesn't redo the work per entry.
 */
export function contains(haystack: string, needleLower: string): boolean {
  return haystack.toLowerCase().includes(needleLower);
}

/**
 * Extract a short snippet around the first match of `needleLower` in `text`.
 * Falls back to the truncated start of the text if the match isn't found
 * (which happens when the match came from a list field joined elsewhere).
 */
export function makeSnippet(text: string, needleLower: string, width = 80): string {
  const idx = text.toLowerCase().indexOf(needleLower);
  if (idx === -1) {
    return text.length > width ? text.slice(0, width) + "…" : text;
  }
  const start = Math.max(0, idx - Math.floor(width / 3));
  const end = Math.min(text.length, start + width);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end).replace(/\s+/g, " ").trim() + suffix;
}

/**
 * Check one entry for a match and, if found, return a SearchHit describing
 * the first field that hit. Field order is tuned to prefer the most
 * "summary-like" fields so the snippet is maximally informative.
 */
export function matchEntry(
  entry: KnowledgeEntry,
  needleLower: string
): SearchHit | null {
  // Tuples of [field name, text]. Order matters — the first match wins
  // for snippet purposes. summary/decision come first because they give
  // the most context per character.
  const fields: Array<[string, string]> = [
    ["summary", entry.summary],
    ["decision", entry.decision],
    ["module", entry.module],
    ["risk", entry.risk ?? ""],
    ["alternatives", (entry.alternatives ?? []).join("\n")],
    ["assumptions", (entry.assumptions ?? []).join("\n")],
    ["tags", (entry.tags ?? []).join(" ")],
  ];

  for (const [name, text] of fields) {
    if (text && contains(text, needleLower)) {
      return { entry, field: name, snippet: makeSnippet(text, needleLower) };
    }
  }
  return null;
}
