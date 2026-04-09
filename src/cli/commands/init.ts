/**
 * init command — Initialize a .knowledge/ directory in the current project.
 */

import type { Command } from "commander";

/**
 * Register the `kb init` subcommand.
 */
export function register(program: Command): void {
  program
    .command("init")
    .description("Initialize a .knowledge/ directory in the current project")
    .action(async () => {
      throw new Error("Not implemented");
    });
}
