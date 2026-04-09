/**
 * explain command — Explain the knowledge entries related to a file.
 */

import type { Command } from "commander";

/**
 * Register the `kb explain <file>` subcommand.
 */
export function register(program: Command): void {
  program
    .command("explain <file>")
    .description("Explain the knowledge entries related to a file")
    .option("--full", "Show full entry content")
    .option("--json", "Output as JSON")
    .option("--no-cache", "Bypass index cache")
    .action(async (_file: string, _options: Record<string, unknown>) => {
      throw new Error("Not implemented");
    });
}
