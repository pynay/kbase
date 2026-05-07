/**
 * search command — Substring search across knowledge entries.
 *
 * Loads every entry from .knowledge/ and performs a case-insensitive
 * substring match over the fields a user would plausibly grep for:
 * module, summary, decision, alternatives, assumptions, risk, tags.
 *
 * No LLM, no index — the markdown files are the source of truth and a
 * linear scan is fast enough at expected KB sizes. An index would only
 * introduce staleness risk for little benefit at this scale.
 */
import type { Command } from "commander";
/**
 * Register the `kb search <query>` subcommand.
 */
export declare function register(program: Command): void;
//# sourceMappingURL=search.d.ts.map