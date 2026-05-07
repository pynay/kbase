/**
 * stale command — Detect knowledge entries that may be outdated.
 *
 * Loads every entry from .knowledge/, then asks git which of each entry's
 * referenced files have been committed after the entry's own timestamp.
 * Any such entry is reported as stale. Pure read — no writes.
 */
import path from "node:path";
import { resolveKnowledgeDir, listEntryPaths, readEntry, } from "../../core/store.js";
import { getRepoRoot, checkAllStaleness, } from "../../core/staleness.js";
// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
/**
 * Print one stale entry in human-readable form. Format is tuned to match
 * `history` / `search` so `kb` commands feel consistent.
 */
function printHumanStale(stale, knowledgeDir) {
    const rel = path.relative(knowledgeDir, stale.entryPath);
    console.log(`\n  ${rel}  ${stale.entrySummary}`);
    console.log(`    entry written: ${stale.entryTimestamp}`);
    for (const f of stale.staleFiles) {
        console.log(`    • ${f.filePath}  (modified ${f.fileModified}, +${f.daysSinceEntry}d)`);
    }
}
// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------
/**
 * Register the `kb stale` subcommand.
 */
export function register(program) {
    program
        .command("stale")
        .description("Detect knowledge entries that may be outdated")
        .option("--json", "Output as JSON")
        .action(async (options) => {
        // 1. Locate .knowledge/ — throws if missing
        const knowledgeDir = await resolveKnowledgeDir();
        // 2. Find the git repo root. Start from the parent of .knowledge/
        //    because that's the project directory the entries describe.
        const repoRoot = getRepoRoot(path.dirname(knowledgeDir));
        if (!repoRoot) {
            console.error("Not inside a git repository — `kb stale` needs git history to\n" +
                "compare file commit dates against entry timestamps.");
            process.exit(1);
        }
        // 3. Load entries alongside their paths. We use listEntryPaths +
        //    readEntry (rather than readAllEntries) because each stale
        //    report needs the originating file path for display.
        const paths = await listEntryPaths(knowledgeDir);
        const entries = await Promise.all(paths.map(async (p) => ({ path: p, entry: await readEntry(p) })));
        // 4. Run the staleness check. All git spawning happens in here.
        const stale = checkAllStaleness(entries, repoRoot);
        // 5. Render output
        if (options.json) {
            console.log(JSON.stringify(stale, null, 2));
            return;
        }
        if (stale.length === 0) {
            console.log("\n  No stale entries. ✓\n");
            return;
        }
        console.log(`\n  ${stale.length} stale entr${stale.length === 1 ? "y" : "ies"}`);
        for (const s of stale)
            printHumanStale(s, knowledgeDir);
        console.log();
    });
}
//# sourceMappingURL=stale.js.map