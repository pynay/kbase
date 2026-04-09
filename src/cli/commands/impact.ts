/**
 * impact command — Show the impact of changes to a file.
 */

import type { Command } from "commander";

/**
 * Register the `kb impact <file>` subcommand.
 */
export function register(program: Command): void {
  program
    .command("impact <file>")
    .description("Show the impact of changes to a file")
    .option("--short", "Show short summary only")
    .option("--json", "Output as JSON")
    .action(async (_file: string, _options: Record<string, unknown>) => {
      throw new Error("Not implemented");
    });
}
