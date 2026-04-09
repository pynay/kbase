/**
 * history command — Show knowledge entry history for a module.
 */

import type { Command } from "commander";

/**
 * Register the `kb history <module>` subcommand.
 */
export function register(program: Command): void {
  program
    .command("history <module>")
    .description("Show knowledge entry history for a module")
    .action(async (_module: string) => {
      throw new Error("Not implemented");
    });
}
