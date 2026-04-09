/**
 * ask command — Ask a natural-language question about the codebase.
 */

import type { Command } from "commander";

/**
 * Register the `kb ask <question>` subcommand.
 */
export function register(program: Command): void {
  program
    .command("ask <question>")
    .description("Ask a natural-language question about the codebase")
    .option("--deep", "Use deeper analysis with LLM")
    .option("--sources", "Show source entries used to answer")
    .action(async (_question: string, _options: Record<string, unknown>) => {
      throw new Error("Not implemented");
    });
}
