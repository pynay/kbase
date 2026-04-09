/**
 * assumptions command — List assumptions, optionally filtered by module.
 */

import type { Command } from "commander";

/**
 * Register the `kb assumptions [module]` subcommand.
 */
export function register(program: Command): void {
  program
    .command("assumptions [module]")
    .description("List assumptions, optionally filtered by module")
    .action(async (_module: string | undefined) => {
      throw new Error("Not implemented");
    });
}
