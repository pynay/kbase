/**
 * index.ts — Build and query _graph/ indexes.
 *
 * The _graph/ directory contains derived JSON indexes built from the
 * knowledge entry markdown files for fast lookups. All four indexes are
 * derived from the same set of entries in a single pass to keep
 * consistency and avoid redundant I/O.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { readAllEntries } from "./store.js";
const GRAPH_DIR = "_graph";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function graphDir(knowledgeDir) {
    return path.join(knowledgeDir, GRAPH_DIR);
}
async function writeJson(dir, name, data) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), JSON.stringify(data, null, 2) + "\n", "utf-8");
}
async function readJson(dir, name) {
    const raw = await fs.readFile(path.join(dir, name), "utf-8");
    return JSON.parse(raw);
}
/** Ensure a module key exists in the dependency index with empty arrays. */
function ensureDepNode(idx, mod) {
    if (!idx[mod])
        idx[mod] = { depends_on: [], depended_on_by: [] };
}
// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
/**
 * Build all four _graph/ indexes from parsed entries and write them to disk.
 *
 * Single-pass accumulation:
 *   1. modules.json   — module name → [entry IDs]
 *   2. files.json     — file path → [entry IDs]
 *   3. dependencies.json — module → { depends_on, depended_on_by }
 *   4. assumptions.json  — module → [{ assumption, entry_id }]
 *
 * `depends_on` and `affects` are treated as dual declarations of the
 * same underlying edge: "X affects Y" is equivalent to "Y depends_on X".
 * Whichever side an entry writer chose, the graph ends up with the same
 * edge, and an edge declared from both sides collapses to one (not two)
 * via the .includes() dedup guards below.
 *
 * If `entries` is not provided, reads them from disk via readAllEntries().
 */
export async function buildIndexes(knowledgeDir, entries) {
    const allEntries = entries ?? await readAllEntries(knowledgeDir);
    const dir = graphDir(knowledgeDir);
    const modules = {};
    const files = {};
    const deps = {};
    const assumptions = {};
    for (const entry of allEntries) {
        const mod = entry.module;
        // modules index
        if (!modules[mod])
            modules[mod] = [];
        modules[mod].push(entry.id);
        // files index
        for (const f of entry.files) {
            if (!files[f])
                files[f] = [];
            files[f].push(entry.id);
        }
        // dependency index — register both directions, from either side
        ensureDepNode(deps, mod);
        // depends_on: entry's module consumes each listed module.
        // Edge direction: mod → dep (mod depends on dep).
        if (entry.depends_on) {
            for (const dep of entry.depends_on) {
                if (!deps[mod].depends_on.includes(dep)) {
                    deps[mod].depends_on.push(dep);
                }
                ensureDepNode(deps, dep);
                if (!deps[dep].depended_on_by.includes(mod)) {
                    deps[dep].depended_on_by.push(mod);
                }
            }
        }
        // affects: entry's module impacts each listed module. This is the
        // inverse declaration of the same edge — "mod affects aff" means
        // "aff depends_on mod". Walk the list and produce the identical
        // pair of mutations, with mod and aff swapped. The .includes()
        // dedup guards below mean an edge declared from both sides (in
        // two separate entries) still lands as one edge, not two.
        if (entry.affects) {
            for (const aff of entry.affects) {
                ensureDepNode(deps, aff);
                if (!deps[aff].depends_on.includes(mod)) {
                    deps[aff].depends_on.push(mod);
                }
                if (!deps[mod].depended_on_by.includes(aff)) {
                    deps[mod].depended_on_by.push(aff);
                }
            }
        }
        // assumptions index
        if (entry.assumptions) {
            if (!assumptions[mod])
                assumptions[mod] = [];
            for (const a of entry.assumptions) {
                assumptions[mod].push({ assumption: a, entry_id: entry.id });
            }
        }
    }
    // Write all four indexes in parallel.
    await Promise.all([
        writeJson(dir, "modules.json", modules),
        writeJson(dir, "files.json", files),
        writeJson(dir, "dependencies.json", deps),
        writeJson(dir, "assumptions.json", assumptions),
    ]);
}
// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
/**
 * Read the dependencies.json index (module dependency graph).
 */
export async function getDependencies(knowledgeDir) {
    return readJson(graphDir(knowledgeDir), "dependencies.json");
}
/**
 * Read the assumptions.json index (assumptions grouped by module).
 */
export async function getAssumptions(knowledgeDir) {
    return readJson(graphDir(knowledgeDir), "assumptions.json");
}
/**
 * Read the modules.json index (module name to entry IDs).
 */
export async function getModules(knowledgeDir) {
    return readJson(graphDir(knowledgeDir), "modules.json");
}
/**
 * Read the files.json index (file path to entry IDs).
 */
export async function getFiles(knowledgeDir) {
    return readJson(graphDir(knowledgeDir), "files.json");
}
// ---------------------------------------------------------------------------
// Human-readable index
// ---------------------------------------------------------------------------
/**
 * Rebuild every derived artifact from the current knowledge entries:
 * the four _graph/ JSON indexes plus the human-readable index.md.
 *
 * Single source of truth for "what counts as a full rebuild" — callers
 * (write_knowledge, kb reindex) all route through this, so adding a
 * future derived artifact means updating one function, not N call sites.
 *
 * Reads entries once and passes them through to both stages to avoid a
 * second disk walk.
 */
export async function rebuildAll(knowledgeDir, entries) {
    const allEntries = entries ?? await readAllEntries(knowledgeDir);
    await buildIndexes(knowledgeDir, allEntries);
    await generateIndexMd(knowledgeDir, allEntries);
}
/**
 * Regenerate .knowledge/index.md — a human-readable (and LLM-scannable)
 * overview of the knowledge base.
 *
 * Format follows the spec in CLAUDE.md:
 *   - Header: title, last-updated timestamp, total entries, module count
 *   - ## Modules — grouped list, newest entry first within each module,
 *                  each line is `summary (YYYY-MM-DD) — \`id\``
 *   - ## Assumptions (all) — flat roll-up of every assumption across
 *                  every entry, prefixed with its module
 *
 * The entry id on each line is kept (the spec example doesn't show it,
 * but it's useful for read_knowledge target lookups — an agent scanning
 * this file can jump directly from summary to fetch-by-id).
 *
 * Sort order:
 *   - Modules: alphabetical, for stable diffs.
 *   - Entries within a module: newest-first by timestamp, so the most
 *     recent decisions float to the top of each section.
 *   - Assumptions: grouped by module alphabetically, preserving the
 *     order entries are emitted within a module.
 */
export async function generateIndexMd(knowledgeDir, entries) {
    const allEntries = entries ?? await readAllEntries(knowledgeDir);
    // Group entries by module.
    const byModule = new Map();
    for (const e of allEntries) {
        if (!byModule.has(e.module))
            byModule.set(e.module, []);
        byModule.get(e.module).push(e);
    }
    // Sort modules alphabetically for stable output across rebuilds.
    const sortedModules = [...byModule.keys()].sort();
    // Sort each module's entries newest-first. Mutate the grouped lists so
    // the assumptions pass below sees the same order as the module section.
    for (const mod of sortedModules) {
        byModule.get(mod).sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
    }
    const lines = [
        "# System Knowledge Base",
        "",
        `Last updated: ${new Date().toISOString()}`,
        `Total entries: ${allEntries.length}`,
        `Modules: ${byModule.size}`,
        "",
    ];
    // Modules section. Empty knowledge bases skip it entirely so the file
    // stays clean rather than showing an orphan header.
    if (byModule.size > 0) {
        lines.push("## Modules");
        lines.push("");
        for (const mod of sortedModules) {
            lines.push(`### ${mod}`);
            for (const e of byModule.get(mod)) {
                // Extract just the date portion of the ISO timestamp — the full
                // timestamp is noise in a scan view, the date is what matters.
                const date = e.timestamp ? e.timestamp.slice(0, 10) : "unknown";
                lines.push(`- ${e.summary} (${date}) — \`${e.id}\``);
            }
            lines.push("");
        }
    }
    // Assumptions roll-up. Walking per-module (in the same sort order)
    // means related assumptions cluster, which makes the list easier to
    // scan than a chronological dump.
    const assumptionLines = [];
    for (const mod of sortedModules) {
        for (const e of byModule.get(mod)) {
            for (const a of e.assumptions ?? []) {
                assumptionLines.push(`- ${mod}: ${a}`);
            }
        }
    }
    if (assumptionLines.length > 0) {
        lines.push("## Assumptions (all)");
        lines.push("");
        lines.push(...assumptionLines);
        lines.push("");
    }
    await fs.writeFile(path.join(knowledgeDir, "index.md"), lines.join("\n"), "utf-8");
}
//# sourceMappingURL=index.js.map