/**
 * deps command — Query the module dependency graph.
 *
 * Reads the pre-built dependencies.json index (created by `kb reindex`)
 * and displays upstream/downstream relationships for a given module.
 * No LLM interaction — pure index lookup.
 */
import type { Command } from "commander";
/**
 * Register the `kb deps <module>` subcommand.
 */
export declare function register(program: Command): void;
//# sourceMappingURL=deps.d.ts.map