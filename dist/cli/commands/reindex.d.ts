/**
 * reindex command — Rebuild all _graph/ indexes and index.md from
 * the knowledge entry markdown files on disk.
 *
 * Pure rebuild — no network, no LLM. Read the markdown, regenerate the
 * derived artifacts. Useful when entries were hand-edited, or when a
 * previous process crashed mid-write and left the indexes stale.
 */
import type { Command } from "commander";
/**
 * Register the `kb reindex` subcommand.
 */
export declare function register(program: Command): void;
//# sourceMappingURL=reindex.d.ts.map