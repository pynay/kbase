/**
 * history command — Show knowledge entry history for a module.
 *
 * Reads all entries from .knowledge/, filters by module, and prints them
 * sorted by timestamp (newest first) so the user sees the most recent
 * decisions at the top. No LLM interaction — pure store read.
 */

import type { Command } from "commander";
import { resolveKnowledgeDir, readAllEntries } from "../../core/store.js";
import type { KnowledgeEntry } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/**
 * Format a single entry for human-readable terminal output.
 *
 * Shows timestamp, short id, and summary on one line, followed by an
 * indented one-line preview of the decision (if any). Kept deliberately
 * terse so a long history stays scannable.
 */
function printHumanEntry(entry: KnowledgeEntry): void {
  const shortId = entry.id.slice(0, 8);
  const ts = entry.timestamp || "(no timestamp)";
  console.log(`  ${ts}  ${shortId}  ${entry.summary}`);
  if (entry.decision) {
    const firstLine = entry.decision.split("\n")[0].trim();
    if (firstLine) console.log(`              ${firstLine}`);
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `kb history <module>` subcommand.
 */
export function register(program: Command): void {
  program
    .command("history <module>")
    .description("Show knowledge entry history for a module")
    .option("--json", "Output as JSON")
    .action(async (module: string, options: Record<string, unknown>) => {
      // 1. Locate .knowledge/ — throws if missing
      const knowledgeDir = await resolveKnowledgeDir();

      // 2. Read every entry and filter to the requested module.
      //    We go through readAllEntries (rather than globbing the
      //    <module>/ subdirectory directly) so this command stays
      //    independent of the on-disk layout chosen by writeEntry.
      const all = await readAllEntries(knowledgeDir);
      const entries = all.filter((e) => e.module === module);

      if (entries.length === 0) {
        console.error(
          `No history found for module "${module}".\n` +
          `Run \`kb reindex\` if you recently added entries.`
        );
        process.exit(1);
      }

      // 3. Sort by timestamp descending (newest first).
      //    ISO 8601 strings sort lexically, so a plain string compare is
      //    correct and avoids Date parsing. Entries with empty timestamps
      //    sink to the bottom.
      entries.sort((a, b) => {
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return b.timestamp.localeCompare(a.timestamp);
      });

      // 4. Render output
      if (options.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      console.log(`\n  ${module}`);
      console.log("  " + "─".repeat(module.length));
      for (const entry of entries) {
        printHumanEntry(entry);
      }
      console.log();
    });
}
