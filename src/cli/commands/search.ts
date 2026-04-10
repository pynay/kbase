/**
 * search command — Substring search across knowledge entries.
 *
 * Loads every entry from .knowledge/ and performs a case-insensitive
 * substring match over the fields a user would plausibly grep for:
 * module, summary, decision, alternatives, assumptions, risk, tags.
 *
 * No LLM, no index — the markdown files are the source of truth and a
 * linear scan is fast enough at expected KB sizes. An index would only
 * introduce staleness risk for little benefit at this scale.
 */

import type { Command } from "commander";
import { resolveKnowledgeDir, readAllEntries } from "../../core/store.js";
import type { KnowledgeEntry } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

interface SearchHit {
  entry: KnowledgeEntry;
  field: string;   // which field matched first — used as a snippet label
  snippet: string; // a short context window around the match
}

/**
 * Return true if `haystack` contains `needle` (case-insensitive).
 * Both strings are already lowercased by the caller to avoid redundant
 * work inside the inner loop.
 */
function contains(haystack: string, needleLower: string): boolean {
  return haystack.toLowerCase().includes(needleLower);
}

/**
 * Extract a short snippet around the first match of `needleLower` in `text`.
 * Falls back to the truncated start of the text if the match isn't found
 * (which happens when the match came from a list field joined elsewhere).
 */
function makeSnippet(text: string, needleLower: string, width = 80): string {
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
function matchEntry(
  entry: KnowledgeEntry,
  needleLower: string
): SearchHit | null {
  // Tuples of [field name, text]. Order matters — the first match wins
  // for snippet purposes. We put summary/decision first because they
  // give the most context per character.
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

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/**
 * Print a single hit in human-readable form.
 *
 *   auth/abc12345  (matched in decision)
 *     OAuth tokens are refreshed server-side …
 */
function printHumanHit(hit: SearchHit): void {
  const { entry, field, snippet } = hit;
  const shortId = entry.id.slice(0, 8);
  console.log(
    `\n  ${entry.module}/${shortId}  ${entry.summary}  (matched in ${field})`
  );
  console.log(`    ${snippet}`);
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `kb search <query>` subcommand.
 */
export function register(program: Command): void {
  program
    .command("search <query>")
    .description("Substring search across knowledge entries")
    .option("--json", "Output as JSON")
    .action(async (query: string, options: Record<string, unknown>) => {
      // 1. Locate .knowledge/ — throws if missing
      const knowledgeDir = await resolveKnowledgeDir();

      // 2. Load all entries and run the linear scan.
      //    Lowercase the needle once outside the loop.
      const needleLower = query.toLowerCase();
      if (needleLower.length === 0) {
        console.error("Search query must be non-empty.");
        process.exit(1);
      }

      const entries = await readAllEntries(knowledgeDir);
      const hits: SearchHit[] = [];
      for (const entry of entries) {
        const hit = matchEntry(entry, needleLower);
        if (hit) hits.push(hit);
      }

      // 3. Stable ordering: newest first, matching history's convention.
      hits.sort((a, b) => {
        if (!a.entry.timestamp) return 1;
        if (!b.entry.timestamp) return -1;
        return b.entry.timestamp.localeCompare(a.entry.timestamp);
      });

      // 4. Render output
      if (options.json) {
        console.log(
          JSON.stringify(
            hits.map((h) => ({
              id: h.entry.id,
              module: h.entry.module,
              summary: h.entry.summary,
              timestamp: h.entry.timestamp,
              field: h.field,
              snippet: h.snippet,
            })),
            null,
            2
          )
        );
        return;
      }

      if (hits.length === 0) {
        console.log(`\n  No entries matched "${query}".\n`);
        return;
      }

      console.log(`\n  ${hits.length} match${hits.length === 1 ? "" : "es"} for "${query}"`);
      for (const hit of hits) printHumanHit(hit);
      console.log();
    });
}
