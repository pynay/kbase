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
import { resolveKnowledgeDir, readAllEntries } from "../../core/store.js";
import { matchEntry } from "../../core/search.js";
// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
/**
 * Print a single hit in human-readable form.
 *
 *   auth/abc12345  (matched in decision)
 *     OAuth tokens are refreshed server-side …
 */
function printHumanHit(hit) {
    const { entry, field, snippet } = hit;
    const shortId = entry.id.slice(0, 8);
    console.log(`\n  ${entry.module}/${shortId}  ${entry.summary}  (matched in ${field})`);
    console.log(`    ${snippet}`);
}
// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------
/**
 * Register the `kb search <query>` subcommand.
 */
export function register(program) {
    program
        .command("search <query>")
        .description("Substring search across knowledge entries")
        .option("--json", "Output as JSON")
        .action(async (query, options) => {
        // 1. Locate .knowledge/ — throws if missing
        const knowledgeDir = await resolveKnowledgeDir();
        // 2. Load all entries and run the linear scan.
        //    Lowercase the needle once outside the loop.
        const needleLower = query.toLowerCase();
        if (needleLower.length === 0) {
            console.error("Search query must be non-empty.");
            process.exit(1);
        }
        const entries = await readAllEntries(knowledgeDir);
        const hits = [];
        for (const entry of entries) {
            const hit = matchEntry(entry, needleLower);
            if (hit)
                hits.push(hit);
        }
        // 3. Stable ordering: newest first, matching history's convention.
        hits.sort((a, b) => {
            if (!a.entry.timestamp)
                return 1;
            if (!b.entry.timestamp)
                return -1;
            return b.entry.timestamp.localeCompare(a.entry.timestamp);
        });
        // 4. Render output
        if (options.json) {
            console.log(JSON.stringify(hits.map((h) => ({
                id: h.entry.id,
                module: h.entry.module,
                summary: h.entry.summary,
                timestamp: h.entry.timestamp,
                field: h.field,
                snippet: h.snippet,
            })), null, 2));
            return;
        }
        if (hits.length === 0) {
            console.log(`\n  No entries matched "${query}".\n`);
            return;
        }
        console.log(`\n  ${hits.length} match${hits.length === 1 ? "" : "es"} for "${query}"`);
        for (const hit of hits)
            printHumanHit(hit);
        console.log();
    });
}
//# sourceMappingURL=search.js.map