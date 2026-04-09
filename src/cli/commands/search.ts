/**
 * search command — Full-text search across knowledge entries.
 */

import type { Command } from "commander";

/**
 * Register the `kb search <query>` subcommand.
 */
export function register(program: Command): void {
  program
    .command("search <query>")
    .description("Full-text search across knowledge entries")
    .action(async (_query: string) => {
      throw new Error("Not implemented");
    });
}
