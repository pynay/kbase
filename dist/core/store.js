// Persistence layer: reads and writes .knowledge/ markdown entries with YAML frontmatter.
/**
 * store.ts — Read/write .knowledge/ markdown files.
 *
 * Persistence layer for knowledge entries stored as markdown files
 * with YAML frontmatter in .knowledge/.
 */
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { v4 as uuidv4 } from "uuid";
import fg from "fast-glob";
// Internal directories inside .knowledge/ that are not entry files.
//  - _graph:  derived JSON indexes, rebuilt from entries
//  - _cache:  per-developer disposable cache (gitignored)
const INTERNAL_DIRS = ["_graph", "_cache"];
// Internal top-level files inside .knowledge/ that are not entry files.
//  - index.md: auto-generated human-readable index, rebuilt from entries
const INTERNAL_FILES = ["index.md"];
// ---------------------------------------------------------------------------
// Directory resolution
// ---------------------------------------------------------------------------
/**
 * Walk up from `startDir` (default: cwd) to find the nearest .knowledge/
 * directory. Returns the absolute path, or null if not found.
 *
 * Uses fs.stat in a loop — no shell spawning. Stops at the filesystem root
 * to avoid an infinite loop.
 */
export async function findKnowledgeDir(startDir = process.cwd()) {
    let dir = path.resolve(startDir);
    while (true) {
        const candidate = path.join(dir, ".knowledge");
        try {
            const stat = await fs.stat(candidate);
            if (stat.isDirectory())
                return candidate;
        }
        catch {
            // not found at this level — keep climbing
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            return null; // reached filesystem root
        dir = parent;
    }
}
/**
 * Resolve the .knowledge/ directory or throw if not found.
 * Most commands call this at startup.
 */
export async function resolveKnowledgeDir(startDir) {
    const dir = await findKnowledgeDir(startDir);
    if (!dir) {
        throw new Error("No .knowledge/ directory found. Run `kb init` to create one.");
    }
    return dir;
}
// ---------------------------------------------------------------------------
// Parse / serialize
// ---------------------------------------------------------------------------
/** H2 headings we extract from the markdown body into structured fields. */
const BODY_SECTIONS = ["Decision", "Alternatives", "Assumptions", "Risk"];
/**
 * Coerce a frontmatter timestamp value into an ISO 8601 string.
 *
 * gray-matter delegates YAML parsing to js-yaml, which auto-converts
 * ISO-shaped date strings into JavaScript Date objects. Our type says
 * `timestamp: string`, and every downstream consumer (sort by
 * `localeCompare`, slice the date portion, serialize to JSON) assumes
 * string. Coercing here is the one place that enforces the invariant.
 */
function normalizeTimestamp(raw) {
    if (typeof raw === "string")
        return raw;
    if (raw instanceof Date)
        return raw.toISOString();
    return "";
}
/**
 * Parse a single markdown file (with YAML frontmatter) into a KnowledgeEntry.
 *
 * Uses gray-matter for frontmatter extraction, then splits the remaining
 * markdown body on H2 headings to populate decision, alternatives,
 * assumptions, and risk fields.
 */
export function parseEntry(filePath, raw) {
    const { data, content } = matter(raw);
    const fm = data;
    // Split body on ## headings to extract known sections.
    const sections = {};
    const sectionRegex = /^## (.+)$/gm;
    let match;
    const cuts = [];
    while ((match = sectionRegex.exec(content)) !== null) {
        cuts.push({ name: match[1].trim(), start: match.index + match[0].length });
    }
    for (let i = 0; i < cuts.length; i++) {
        const end = i + 1 < cuts.length ? cuts[i + 1].start - `## ${cuts[i + 1].name}`.length : content.length;
        // Grab text between this heading and the next (or EOF), subtracting
        // the length of the next "## heading" line so we don't bleed into it.
        const text = content.slice(cuts[i].start, end).trim();
        sections[cuts[i].name] = text;
    }
    // Parse list-style sections (Alternatives, Assumptions) into string arrays.
    function parseList(text) {
        if (!text)
            return undefined;
        const items = text
            .split("\n")
            .map((line) => line.replace(/^[-*]\s*/, "").trim())
            .filter(Boolean);
        return items.length > 0 ? items : undefined;
    }
    return {
        id: fm.id ?? path.basename(filePath, ".md"),
        module: fm.module ?? "",
        summary: fm.summary ?? "",
        timestamp: normalizeTimestamp(fm.timestamp),
        agent: fm.agent ?? "",
        files: fm.files ?? [],
        affects: fm.affects,
        depends_on: fm.depends_on,
        supersedes: fm.supersedes,
        tags: fm.tags,
        decision: sections["Decision"] ?? "",
        alternatives: parseList(sections["Alternatives"]),
        assumptions: parseList(sections["Assumptions"]),
        risk: sections["Risk"],
    };
}
/**
 * Serialize a KnowledgeEntry to a markdown string with YAML frontmatter.
 *
 * Frontmatter contains identity, code-mapping, and metadata fields.
 * Body contains narrative sections as ## headings.
 */
export function serializeEntry(entry) {
    // Build frontmatter object — omit undefined/empty optional fields to keep
    // the YAML clean.
    const fm = {
        id: entry.id,
        module: entry.module,
        summary: entry.summary,
        timestamp: entry.timestamp,
        agent: entry.agent,
        files: entry.files,
    };
    if (entry.affects?.length)
        fm.affects = entry.affects;
    if (entry.depends_on?.length)
        fm.depends_on = entry.depends_on;
    if (entry.supersedes)
        fm.supersedes = entry.supersedes;
    if (entry.tags?.length)
        fm.tags = entry.tags;
    // Build markdown body from narrative sections.
    const bodyParts = [];
    if (entry.decision) {
        bodyParts.push(`## Decision\n\n${entry.decision}`);
    }
    if (entry.alternatives?.length) {
        const list = entry.alternatives.map((a) => `- ${a}`).join("\n");
        bodyParts.push(`## Alternatives\n\n${list}`);
    }
    if (entry.assumptions?.length) {
        const list = entry.assumptions.map((a) => `- ${a}`).join("\n");
        bodyParts.push(`## Assumptions\n\n${list}`);
    }
    if (entry.risk) {
        bodyParts.push(`## Risk\n\n${entry.risk}`);
    }
    return matter.stringify("\n" + bodyParts.join("\n\n") + "\n", fm);
}
// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------
/**
 * Read and parse a single entry file from disk.
 */
export async function readEntry(filePath) {
    const raw = await fs.readFile(filePath, "utf-8");
    return parseEntry(filePath, raw);
}
/**
 * List all entry .md file paths in .knowledge/, excluding internal dirs
 * (_graph, _cache) and internal top-level files (index.md). Uses
 * fast-glob for efficient recursive matching.
 *
 * The ignore list mixes directory-glob patterns with specific file
 * paths because index.md is a single file at the root and needs an
 * exact-path ignore rather than a dir-wildcard.
 */
export async function listEntryPaths(knowledgeDir) {
    const ignore = [
        ...INTERNAL_DIRS.map((d) => path.join(knowledgeDir, d) + "/**"),
        ...INTERNAL_FILES.map((f) => path.join(knowledgeDir, f)),
    ];
    const paths = await fg("**/*.md", {
        cwd: knowledgeDir,
        absolute: true,
        ignore,
    });
    return paths.sort();
}
/**
 * Read and parse all entries from .knowledge/.
 */
export async function readAllEntries(knowledgeDir) {
    const paths = await listEntryPaths(knowledgeDir);
    return Promise.all(paths.map((p) => readEntry(p)));
}
// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
/**
 * Write a new knowledge entry to disk. Returns the file path and generated ID.
 *
 * Files are organized by module: .knowledge/<module>/<id>.md
 * A UUID is generated for the ID, and the current ISO timestamp is stamped.
 */
export async function writeEntry(knowledgeDir, entry) {
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    const full = {
        ...entry,
        id,
        timestamp,
        agent: entry.agent ?? "unknown",
    };
    const moduleDir = path.join(knowledgeDir, full.module);
    await fs.mkdir(moduleDir, { recursive: true });
    const filePath = path.join(moduleDir, `${id}.md`);
    await fs.writeFile(filePath, serializeEntry(full), "utf-8");
    return { path: filePath, id };
}
/**
 * Schema-level quality floor for knowledge entry decisions.
 * Throws if the decision text is below the minimum length.
 */
export function validateDecisionLength(decision, minLen = 80) {
    if (decision.length < minLen) {
        throw new Error(`decision must be at least ${minLen} characters (got ${decision.length}). ` +
            `If this change isn't worth a detailed explanation, it may not be worth a knowledge entry.`);
    }
}
//# sourceMappingURL=store.js.map