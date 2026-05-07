/**
 * stale command — Detect knowledge entries that may be outdated.
 *
 * Loads every entry from .knowledge/, then asks git which of each entry's
 * referenced files have been committed after the entry's own timestamp.
 * Any such entry is reported as stale. Pure read — no writes.
 */
import type { Command } from "commander";
/**
 * Register the `kb stale` subcommand.
 */
export declare function register(program: Command): void;
//# sourceMappingURL=stale.d.ts.map