/**
 * reindex command — Rebuild all _graph/ indexes and index.md from
 * the knowledge entry markdown files on disk.
 *
 * Pure rebuild — no network, no LLM. Read the markdown, regenerate the
 * derived artifacts. Useful when entries were hand-edited, or when a
 * previous process crashed mid-write and left the indexes stale.
 */

import type { Command } from "commander";
import { resolveKnowledgeDir, readAllEntries } from "../../core/store.js";
import { rebuildAll } from "../../core/index.js";

/**
 * Register the `kb reindex` subcommand.
 */
export function register(program: Command): void {
  program
    .command("reindex")
    .description("Rebuild _graph/ indexes and index.md from knowledge entries")
    .action(async () => {
      const knowledgeDir = await resolveKnowledgeDir();

      // Read entries once here so we can both drive the rebuild and
      // report the counts afterwards without a second disk walk.
      const entries = await readAllEntries(knowledgeDir);
      await rebuildAll(knowledgeDir, entries);

      const moduleCount = new Set(entries.map((e) => e.module)).size;
      console.log(
        `\n  Rebuilt indexes: ${entries.length} ${
          entries.length === 1 ? "entry" : "entries"
        } across ${moduleCount} ${moduleCount === 1 ? "module" : "modules"}.\n`
      );
    });
}
