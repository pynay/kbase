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
import fs from "node:fs/promises";
import path from "node:path";
import { resolveKnowledgeDir, readAllEntries } from "../../core/store.js";
import { getFiles, getDependencies } from "../../core/index.js";
import { loadConfig, query } from "../../core/llm.js";
import { formatEntryForPrompt } from "./_shared.js";
const SYSTEM_PROMPT = `You are a senior engineer analyzing the blast radius of changes to a
file. You have the file's source code, knowledge base entries about
this file and its module, and the dependency graph showing what depends
on this module and what this module depends on.

Your job is to:
1. List every file/module that could be affected by changes to this file,
   with a specific explanation of WHY (not just "it imports this").
2. List every assumption that becomes at risk if this file changes.
3. Provide a risk summary: is this a safe change or a dangerous one?
4. Suggest what to test after making changes.

Be specific. Generic advice like "run the test suite" is not helpful.
Tell them WHICH behaviors to verify and WHY.`;
/**
 * Walk the dependency index one hop out from each seed module, in both
 * directions, and return the union of seeds + their neighbors.
 *
 * One hop is a deliberate choice: transitive closures balloon prompt
 * size, and the LLM can reason about "X depends on Y depends on Z" if
 * we give it Y's context — it doesn't need Z's knowledge entries loaded
 * just to flag that Z is downstream.
 */
function collectAffectedModules(seeds, deps) {
    const out = new Set();
    for (const seed of seeds) {
        out.add(seed);
        const node = deps[seed];
        if (!node)
            continue;
        for (const m of node.depends_on)
            out.add(m);
        for (const m of node.depended_on_by)
            out.add(m);
    }
    return out;
}
/**
 * Render the dependency slice for the direct modules in a terse
 * human-readable form. We inline this rather than relying on the LLM
 * to parse raw JSON so it has one less thing to get wrong.
 */
function renderDependencyBlock(directModules, deps) {
    if (directModules.length === 0) {
        return "(no knowledge entries reference this file yet — dependency graph is empty)";
    }
    return directModules
        .map((m) => {
        const node = deps[m];
        if (!node)
            return `${m}: (not present in dependency graph)`;
        const up = node.depends_on.length > 0 ? node.depends_on.join(", ") : "(none)";
        const down = node.depended_on_by.length > 0 ? node.depended_on_by.join(", ") : "(none)";
        return `${m}\n  depends on:     ${up}\n  depended on by: ${down}`;
    })
        .join("\n\n");
}
/**
 * Register the `kb impact <file>` subcommand.
 */
export function register(program) {
    program
        .command("impact <file>")
        .description("LLM-powered blast radius analysis for a file")
        .option("--json", "Output the gathered context as JSON instead of streaming prose")
        .action(async (file, options) => {
        const knowledgeDir = await resolveKnowledgeDir();
        const absPath = path.resolve(process.cwd(), file);
        let fileContents;
        try {
            fileContents = await fs.readFile(absPath, "utf-8");
        }
        catch {
            console.error(`Cannot read file: ${absPath}`);
            process.exit(1);
        }
        const repoRoot = path.dirname(knowledgeDir);
        const repoRelative = path.relative(repoRoot, absPath);
        const filesIndex = await getFiles(knowledgeDir);
        const lookupKeys = [file, repoRelative, absPath];
        const entryIds = new Set();
        for (const key of lookupKeys) {
            if (Object.prototype.hasOwnProperty.call(filesIndex, key)) {
                for (const id of filesIndex[key])
                    entryIds.add(id);
            }
        }
        const allEntries = await readAllEntries(knowledgeDir);
        const direct = allEntries.filter((e) => entryIds.has(e.id));
        const directModules = [...new Set(direct.map((e) => e.module))];
        const deps = await getDependencies(knowledgeDir);
        const affectedModules = collectAffectedModules(directModules, deps);
        // Pull entries for every affected module. This is the superset —
        // includes direct entries plus everything one hop out.
        const relevant = allEntries.filter((e) => affectedModules.has(e.module));
        const relatedOnly = relevant.filter((e) => !direct.some((d) => d.id === e.id));
        if (options.json) {
            // Slice the dep index down to just the relevant modules so the
            // output is useful in isolation (piping to jq, etc.).
            const depSlice = {};
            for (const m of affectedModules) {
                if (deps[m])
                    depSlice[m] = deps[m];
            }
            console.log(JSON.stringify({
                file: repoRelative,
                directModules,
                affectedModules: [...affectedModules],
                dependencies: depSlice,
                direct: direct.map((e) => ({ id: e.id, module: e.module, summary: e.summary })),
                related: relatedOnly.map((e) => ({ id: e.id, module: e.module, summary: e.summary })),
            }, null, 2));
            return;
        }
        const prompt = `## Source file: ${repoRelative}\n\n` +
            "```\n" +
            fileContents +
            "\n```\n\n" +
            `## Knowledge entries for this file (${direct.length})\n\n` +
            (direct.length === 0
                ? "(none)"
                : direct.map(formatEntryForPrompt).join("\n\n---\n\n")) +
            "\n\n" +
            `## Dependency graph\n\n${renderDependencyBlock(directModules, deps)}\n\n` +
            `## Knowledge entries for related modules (${relatedOnly.length})\n\n` +
            (relatedOnly.length === 0
                ? "(none)"
                : relatedOnly.map(formatEntryForPrompt).join("\n\n---\n\n"));
        process.stdout.write(`\n  Blast radius for ${repoRelative}\n\n`);
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
//# sourceMappingURL=impact.js.map