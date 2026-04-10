/**
 * deps command — Query the module dependency graph.
 *
 * Reads the pre-built dependencies.json index (created by `kb reindex`)
 * and displays upstream/downstream relationships for a given module.
 * No LLM interaction — pure index lookup.
 */

import type { Command } from "commander";
import { resolveKnowledgeDir } from "../../core/store.js";
import { getDependencies } from "../../core/index.js";
import type { DependencyIndex } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/**
 * Format a dependency node for human-readable terminal output.
 *
 * Prints the module name as a header, then two labelled lists:
 *   depends on:      [upstream modules this module imports from]
 *   depended on by:  [downstream modules that import this module]
 *
 * Chose labelled lists over a tree/graph view because:
 *  + Simpler to scan for a single module lookup
 *  + Consistent output regardless of graph depth
 *  - Doesn't show transitive deps (acceptable — `--up`/`--down` filter
 *    already narrows the view, and full graph traversal is a future feature)
 */
function printHuman(
  module: string,
  node: DependencyIndex[string],
  direction: "up" | "down" | "both"
): void {
  console.log(`\n  ${module}`);
  console.log("  " + "─".repeat(module.length));

  if (direction === "up" || direction === "both") {
    console.log("\n  depends on:");
    if (node.depends_on.length === 0) {
      console.log("    (none)");
    } else {
      for (const dep of node.depends_on) {
        console.log(`    → ${dep}`);
      }
    }
  }

  if (direction === "down" || direction === "both") {
    console.log("\n  depended on by:");
    if (node.depended_on_by.length === 0) {
      console.log("    (none)");
    } else {
      for (const dep of node.depended_on_by) {
        console.log(`    ← ${dep}`);
      }
    }
  }

  console.log();
}

/**
 * Format a dependency node as JSON. Respects direction filtering so
 * `--up --json` only includes the depends_on array, not both.
 */
function printJson(
  module: string,
  node: DependencyIndex[string],
  direction: "up" | "down" | "both"
): void {
  const output: Record<string, unknown> = { module };

  if (direction === "up" || direction === "both") {
    output.depends_on = node.depends_on;
  }
  if (direction === "down" || direction === "both") {
    output.depended_on_by = node.depended_on_by;
  }

  console.log(JSON.stringify(output, null, 2));
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `kb deps <module>` subcommand.
 */
export function register(program: Command): void {
  program
    .command("deps <module>")
    .description("Query the module dependency graph")
    .option("--up", "Show upstream dependencies")
    .option("--down", "Show downstream dependents")
    .option("--json", "Output as JSON")
    .action(async (module: string, options: Record<string, unknown>) => {
      // 1. Locate .knowledge/ — throws if missing
      const knowledgeDir = await resolveKnowledgeDir();

      // 2. Read the pre-built dependency index
      const deps = await getDependencies(knowledgeDir);

      // 3. Look up the requested module
      const node = deps[module];
      if (!node) {
        console.error(
          `Module "${module}" not found in the dependency index.\n` +
          `Run \`kb reindex\` if you recently added entries.`
        );
        process.exit(1);
      }

      // 4. Determine direction filter from flags
      //    --up only  → "up"   (show what this module depends on)
      //    --down only → "down" (show what depends on this module)
      //    both or neither → "both"
      let direction: "up" | "down" | "both" = "both";
      if (options.up && !options.down) direction = "up";
      else if (options.down && !options.up) direction = "down";

      // 5. Render output
      if (options.json) {
        printJson(module, node, direction);
      } else {
        printHuman(module, node, direction);
      }
    });
}
