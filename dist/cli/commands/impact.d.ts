/**
 * impact command — LLM-powered blast radius analysis for a file.
 *
 * Pipeline:
 *   1. Read the target source file.
 *   2. Look it up in files.json → direct entries → direct modules.
 *   3. Walk dependencies.json in BOTH directions for each direct module,
 *      collecting every module that could be affected.
 *   4. Pull entries for every module in that set.
 *   5. Build a prompt with source + dependency graph slice + entries.
 *   6. Stream the LLM response.
 *
 * The difference from `kb explain`: explain gathers one hop of context
 * to help a reader understand the code. impact deliberately walks the
 * dependency graph because the whole point is "what could break".
 */
import type { Command } from "commander";
/**
 * Register the `kb impact <file>` subcommand.
 */
export declare function register(program: Command): void;
//# sourceMappingURL=impact.d.ts.map