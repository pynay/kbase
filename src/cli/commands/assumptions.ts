/**
 * assumptions command — List assumptions, optionally filtered by module.
 *
 * Reads the pre-built assumptions.json index (created by `kb reindex`)
 * and prints each assumption grouped by module. When a module argument is
 * provided, only that module's assumptions are shown.
 * No LLM interaction — pure index lookup.
 */

import type { Command } from "commander";
import { resolveKnowledgeDir } from "../../core/store.js";
import { getAssumptions } from "../../core/index.js";
import type { AssumptionIndex, AssumptionEntry } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/**
 * Print assumptions for a single module.
 *
 * Each assumption is shown with its source entry ID in parentheses so
 * the user can trace back to the knowledge entry that declared it.
 *
 * Format:
 *   auth
 *   ────
 *     • OAuth tokens expire after 1h  (entry: abc-123)
 *     • Refresh tokens are stored server-side  (entry: def-456)
 */
function printModuleAssumptions(
  module: string,
  entries: AssumptionEntry[]
): void {
  console.log(`\n  ${module}`);
  console.log("  " + "─".repeat(module.length));
  for (const { assumption, entry_id } of entries) {
    console.log(`    • ${assumption}  (entry: ${entry_id.slice(0, 8)})`);
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `kb assumptions [module]` subcommand.
 */
export function register(program: Command): void {
  program
    .command("assumptions [module]")
    .description("List assumptions, optionally filtered by module")
    .action(async (module: string | undefined) => {
      // 1. Locate .knowledge/
      const knowledgeDir = await resolveKnowledgeDir();

      // 2. Read the pre-built assumptions index
      const assumptions = await getAssumptions(knowledgeDir);

      // 3. Determine which modules to show
      if (module) {
        // --- Single-module mode ---
        const entries = assumptions[module];
        if (!entries || entries.length === 0) {
          console.error(
            `No assumptions found for module "${module}".\n` +
            `Run \`kb reindex\` if you recently added entries.`
          );
          process.exit(1);
        }
        printModuleAssumptions(module, entries);
      } else {
        // --- All-modules mode ---
        const modules = Object.keys(assumptions).sort();
        if (modules.length === 0) {
          console.log("No assumptions recorded in the knowledge base.");
          return;
        }
        for (const mod of modules) {
          printModuleAssumptions(mod, assumptions[mod]);
        }
      }

      console.log();
    });
}
