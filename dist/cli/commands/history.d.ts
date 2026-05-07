/**
 * history command — Show knowledge entry history for a module.
 *
 * Reads all entries from .knowledge/, filters by module, and prints them
 * sorted by timestamp (newest first) so the user sees the most recent
 * decisions at the top. No LLM interaction — pure store read.
 */
import type { Command } from "commander";
/**
 * Register the `kb history <module>` subcommand.
 */
export declare function register(program: Command): void;
//# sourceMappingURL=history.d.ts.map