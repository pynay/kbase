/**
 * assumptions command — List assumptions, optionally filtered by module.
 *
 * Reads the pre-built assumptions.json index (created by `kb reindex`)
 * and prints each assumption grouped by module. When a module argument is
 * provided, only that module's assumptions are shown.
 * No LLM interaction — pure index lookup.
 */
import type { Command } from "commander";
/**
 * Register the `kb assumptions [module]` subcommand.
 */
export declare function register(program: Command): void;
//# sourceMappingURL=assumptions.d.ts.map