/**
 * reindex command — Rebuild all _graph/ indexes from knowledge entries.
 */

import type { Command } from "commander";

/**
 * Register the `kb reindex` subcommand.
 */
export function register(program: Command): void {
  program
    .command("reindex")
    .description("Rebuild all _graph/ indexes from knowledge entries")
    .action(async () => {
      throw new Error("Not implemented");
    });
}
