/**
 * deps command — Query the module dependency graph.
 */

import type { Command } from "commander";

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
    .action(async (_module: string, _options: Record<string, unknown>) => {
      throw new Error("Not implemented");
    });
}
