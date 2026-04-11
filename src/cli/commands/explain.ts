/**
 * explain command — LLM-powered walkthrough of a source file, grounded
 * in the knowledge base entries that document it.
 *
 * Pipeline:
 *   1. Read the target source file from disk.
 *   2. Look it up in files.json → direct knowledge entries.
 *   3. Pull one-hop related entries: entries in other modules whose
 *      affects/depends_on lists include any of the direct entries' modules.
 *   4. Build a prompt with source + both entry sets.
 *   5. Stream the LLM response to stdout.
 *
 * The one-hop boundary is deliberate. Transitive traversal blows up prompt
 * size fast and `kb impact` is the right command for full blast radius.
 * Here we just want "what context does a reader need to not misread this
 * file?", which one hop usually covers.
 */

import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveKnowledgeDir, readAllEntries } from "../../core/store.js";
import { getFiles } from "../../core/index.js";
import { loadConfig, query } from "../../core/llm.js";
import type { KnowledgeEntry } from "../../core/types.js";
import { formatEntryForPrompt } from "./_shared.js";

const SYSTEM_PROMPT = `You are explaining a source code file to a developer who didn't write it.
You have access to the file's source code and to knowledge base entries
that document the decisions and assumptions behind this code.

Your job is to walk through the file and highlight:
- Non-obvious behavior (things that would surprise someone reading the code)
- Load-bearing lines (things that would break other parts of the system if changed)
- Assumptions baked into the code (things that aren't enforced but are relied upon)
- Connections to other parts of the system (via the knowledge base entries)

Do NOT explain obvious things (imports, standard patterns, boilerplate).
Focus on what a developer NEEDS to know to safely modify this file.

Ground every claim in the actual code or the knowledge base entries.
If you're not sure about something, say so.`;

/**
 * Resolve an incoming file argument to its canonical repo-relative form.
 *
 * files.json keys are whatever was recorded at write time — usually
 * repo-relative paths. We try three candidates in order (the raw argument,
 * the repo-relative form, and the absolute path) to tolerate callers who
 * pass either shape.
 */
function fileLookupKeys(fileArg: string, absPath: string, repoRoot: string): string[] {
  const repoRelative = path.relative(repoRoot, absPath);
  return [fileArg, repoRelative, absPath];
}

/**
 * Collect knowledge entries that directly reference a given file.
 */
function findDirectEntries(
  entries: KnowledgeEntry[],
  filesIndex: Record<string, string[]>,
  lookupKeys: string[]
): KnowledgeEntry[] {
  const ids = new Set<string>();
  for (const key of lookupKeys) {
    if (Object.prototype.hasOwnProperty.call(filesIndex, key)) {
      for (const id of filesIndex[key]) ids.add(id);
    }
  }
  return entries.filter((e) => ids.has(e.id));
}

/**
 * Collect entries in OTHER modules that reference any of the given
 * direct modules via affects or depends_on. One hop out — we intentionally
 * don't walk further to keep prompt size bounded.
 */
function findRelatedEntries(
  entries: KnowledgeEntry[],
  directModules: Set<string>
): KnowledgeEntry[] {
  return entries.filter(
    (e) =>
      !directModules.has(e.module) &&
      ((e.affects ?? []).some((m) => directModules.has(m)) ||
        (e.depends_on ?? []).some((m) => directModules.has(m)))
  );
}

/**
 * Register the `kb explain <file>` subcommand.
 */
export function register(program: Command): void {
  program
    .command("explain <file>")
    .description("LLM-powered walkthrough of a file, grounded in the knowledge base")
    .option("--json", "Output the gathered context as JSON instead of streaming prose")
    .action(async (file: string, options: Record<string, unknown>) => {
      const knowledgeDir = await resolveKnowledgeDir();
      const absPath = path.resolve(process.cwd(), file);

      // Read the source file first — if this fails, nothing downstream
      // is worth doing. Exit non-zero so scripts can tell.
      let fileContents: string;
      try {
        fileContents = await fs.readFile(absPath, "utf-8");
      } catch {
        console.error(`Cannot read file: ${absPath}`);
        process.exit(1);
      }

      // repoRoot = parent of .knowledge/ — this is the reference frame
      // that files.json keys are expressed against.
      const repoRoot = path.dirname(knowledgeDir);
      const repoRelative = path.relative(repoRoot, absPath);

      const filesIndex = await getFiles(knowledgeDir);
      const allEntries = await readAllEntries(knowledgeDir);

      const direct = findDirectEntries(
        allEntries,
        filesIndex,
        fileLookupKeys(file, absPath, repoRoot)
      );
      const directModules = new Set(direct.map((e) => e.module));
      const related = findRelatedEntries(allEntries, directModules);

      // --json short-circuits: just dump the context we gathered so callers
      // can inspect what would be sent to the LLM without burning tokens.
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              file: repoRelative,
              modules: [...directModules],
              direct: direct.map((e) => ({
                id: e.id,
                module: e.module,
                summary: e.summary,
              })),
              related: related.map((e) => ({
                id: e.id,
                module: e.module,
                summary: e.summary,
              })),
            },
            null,
            2
          )
        );
        return;
      }

      const prompt =
        `## Source file: ${repoRelative}\n\n` +
        "```\n" +
        fileContents +
        "\n```\n\n" +
        `## Knowledge base entries referencing this file (${direct.length})\n\n` +
        (direct.length === 0
          ? "(none)"
          : direct.map(formatEntryForPrompt).join("\n\n---\n\n")) +
        "\n\n" +
        `## Related entries — other modules affecting or depended on by this file's modules (${related.length})\n\n` +
        (related.length === 0
          ? "(none)"
          : related.map(formatEntryForPrompt).join("\n\n---\n\n"));

      // Print a small header so the streamed output has context even
      // if the user pipes it to a pager.
      process.stdout.write(`\n  ${repoRelative}\n`);
      if (directModules.size > 0) {
        process.stdout.write(`  Modules: ${[...directModules].join(", ")}\n`);
      }
      process.stdout.write("\n");

      const config = await loadConfig();
      for await (const chunk of query(config, {
        system: SYSTEM_PROMPT,
        prompt,
        maxTokens: 4096,
      })) {
        process.stdout.write(chunk);
      }
      process.stdout.write("\n");
    });
}
