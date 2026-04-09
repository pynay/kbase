/**
 * stale command — Detect knowledge entries that may be outdated.
 */

import type { Command } from "commander";

/**
 * Register the `kb stale` subcommand.
 */
export function register(program: Command): void {
  program
    .command("stale")
    .description("Detect knowledge entries that may be outdated")
    .action(async () => {
      throw new Error("Not implemented");
    });
}
