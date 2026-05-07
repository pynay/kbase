/**
 * ask command — Natural-language Q&A grounded in the knowledge base.
 *
 * Pipeline:
 *   1. Extract keywords from the question (lowercase, split, drop stopwords).
 *   2. Boost module-name matches — if the question literally names a module,
 *      that's a strong signal to include its entries.
 *   3. Score every entry by keyword match count across its searchable text.
 *   4. Take the top N (10) by score, tiebreaking by recency.
 *   5. If --deep, also read every source file those entries reference.
 *   6. Build a prompt with question + entries (+ optional source).
 *   7. Stream the LLM response.
 *
 * This is intentionally a simple scoring function, not proper FTS. At the
 * scale kbase is designed for (hundreds of entries), substring counts are
 * fast and the LLM is the one doing the real reasoning — the retriever
 * just needs to get relevant-ish entries into its context window. If this
 * underperforms we can swap in FTS5 or embeddings later without changing
 * the command surface.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { resolveKnowledgeDir, readAllEntries } from "../../core/store.js";
import { getModules } from "../../core/index.js";
import { loadConfig, query } from "../../core/llm.js";
import { formatEntryForPrompt } from "./_shared.js";
const SYSTEM_PROMPT = `You are answering a developer's question about their codebase. You have
access to a knowledge base of decisions, assumptions, and architectural
choices that have been recorded over time.

Rules:
- Ground every claim in a specific knowledge base entry or source file.
- Cite the entry by module and short id so the developer can read more.
- If the knowledge base doesn't contain enough information to answer,
  say so clearly and suggest what the developer should investigate.
- Do NOT make up information that isn't in the knowledge base or source.
- Be specific and actionable, not generic.`;
/**
 * Maximum number of entries to feed into the LLM prompt. 10 is a soft
 * cap chosen by the spec's context budget section — enough to cover
 * most questions without pushing the prompt past the token budget.
 */
const TOP_N = 10;
/**
 * English stopwords. Deliberately a small set — we only need to strip
 * the words that are so common they'd dominate the scoring without
 * contributing signal. Exhaustive stopword lists would drop useful
 * technical words like "can" (CAN bus) or "it" (IT department) in the
 * wrong context, but at this scope that trade-off is fine.
 */
const STOPWORDS = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "am",
    "do", "does", "did", "have", "has", "had", "having",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "its", "our", "their",
    "this", "that", "these", "those",
    "and", "or", "but", "if", "because", "as", "so", "than", "then",
    "for", "of", "to", "in", "on", "at", "by", "with", "from", "about", "over",
    "under", "into", "out", "up", "down",
    "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
    "can", "could", "should", "would", "will", "may", "might", "must", "shall",
    "not", "no", "nor", "only", "own", "same", "very", "just", "now",
    "there", "here", "all", "any", "both", "each", "few", "more", "most",
    "some", "such", "too", "much", "many", "one", "two",
]);
/**
 * Extract a set of searchable keywords from a free-form question.
 * Lowercases, splits on non-alphanumeric (preserving / _ - so module
 * paths like "auth/session" survive), drops short/stopword tokens,
 * de-duplicates.
 */
function extractKeywords(question) {
    const seen = new Set();
    for (const raw of question.toLowerCase().split(/[^a-z0-9/_-]+/)) {
        if (raw.length <= 2)
            continue;
        if (STOPWORDS.has(raw))
            continue;
        seen.add(raw);
    }
    return [...seen];
}
/**
 * Score a single entry by counting non-overlapping keyword occurrences
 * across its searchable text. Module name is included with extra weight
 * (counted twice) because a match on the module identifier is a much
 * stronger signal than a coincidental hit in prose.
 */
function scoreEntry(entry, keywords) {
    const haystackParts = [
        entry.summary,
        entry.decision,
        (entry.alternatives ?? []).join(" "),
        (entry.assumptions ?? []).join(" "),
        entry.risk ?? "",
        (entry.tags ?? []).join(" "),
    ];
    const hay = haystackParts.join(" ").toLowerCase();
    const moduleLower = entry.module.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
        // Count non-overlapping substring hits. indexOf in a loop avoids
        // allocating a RegExp per keyword; fine at this scale.
        let idx = 0;
        while ((idx = hay.indexOf(kw, idx)) !== -1) {
            score++;
            idx += kw.length;
        }
        // Module-name hit gets a 2x boost — an agent asking about
        // "auth/session" almost certainly wants that module's entries
        // even if the body prose doesn't repeat the module path.
        if (moduleLower.includes(kw))
            score += 2;
    }
    return score;
}
/**
 * Read every source file referenced by the given entries. Files that
 * have been moved/deleted since the entry was written are silently
 * skipped — we don't want a stale entry to crash the command.
 */
async function readReferencedSources(entries, repoRoot) {
    const fileSet = new Set();
    for (const e of entries)
        for (const f of e.files ?? [])
            fileSet.add(f);
    const out = [];
    for (const rel of fileSet) {
        try {
            const abs = path.resolve(repoRoot, rel);
            const contents = await fs.readFile(abs, "utf-8");
            out.push({ path: rel, contents });
        }
        catch {
            // Moved or deleted — skip.
        }
    }
    return out;
}
/**
 * Register the `kb ask <question>` subcommand.
 */
export function register(program) {
    program
        .command("ask <question>")
        .description("Ask a natural-language question about the codebase")
        .option("--deep", "Also read source files referenced by relevant entries")
        .option("--sources", "Show which knowledge entries were used to form the answer")
        .option("--json", "Output gathered context as JSON without calling the LLM")
        .action(async (question, options) => {
        const knowledgeDir = await resolveKnowledgeDir();
        const keywords = extractKeywords(question);
        if (keywords.length === 0) {
            console.error("Question must contain at least one searchable word.");
            process.exit(1);
        }
        // Module-name boost: if the question text contains a module name
        // literally (e.g. "what's in auth/session?"), add that module's
        // name as a keyword so its entries score higher. We match on the
        // lowercased question, not the extracted keywords, because module
        // names may contain slashes that the keyword splitter keeps but
        // might tokenize differently.
        const modules = await getModules(knowledgeDir);
        const questionLower = question.toLowerCase();
        for (const mod of Object.keys(modules)) {
            if (questionLower.includes(mod.toLowerCase())) {
                keywords.push(mod.toLowerCase());
            }
        }
        const allEntries = await readAllEntries(knowledgeDir);
        const ranked = allEntries
            .map((entry) => ({ entry, score: scoreEntry(entry, keywords) }))
            .filter((r) => r.score > 0)
            .sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            // Tiebreak on recency — newer entries usually reflect current state.
            return (b.entry.timestamp ?? "").localeCompare(a.entry.timestamp ?? "");
        })
            .slice(0, TOP_N)
            .map((r) => r.entry);
        if (ranked.length === 0) {
            console.log("\n  No relevant entries found in the knowledge base.\n" +
                "  Try rephrasing, or check `kb search` for substring matches.\n");
            return;
        }
        const repoRoot = path.dirname(knowledgeDir);
        if (options.json) {
            console.log(JSON.stringify({
                question,
                entries: ranked.map((e) => ({
                    id: e.id,
                    module: e.module,
                    summary: e.summary,
                    files: e.files,
                })),
            }, null, 2));
            return;
        }
        // --deep: also pull source files. This is opt-in because it
        // trades significant token budget (whole source files) for
        // grounding in real code, which the user may or may not want.
        const sourceBlocks = options.deep
            ? await readReferencedSources(ranked, repoRoot)
            : [];
        const prompt = `## Question\n\n${question}\n\n` +
            `## Relevant knowledge base entries (${ranked.length})\n\n` +
            ranked.map(formatEntryForPrompt).join("\n\n---\n\n") +
            (sourceBlocks.length > 0
                ? "\n\n## Referenced source files\n\n" +
                    sourceBlocks
                        .map((b) => `### ${b.path}\n\n\`\`\`\n${b.contents}\n\`\`\``)
                        .join("\n\n")
                : "");
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
        if (options.sources) {
            process.stdout.write("\n  Sources:\n");
            for (const e of ranked) {
                process.stdout.write(`    - ${e.module}/${e.id.slice(0, 8)}  ${e.summary}\n`);
            }
            process.stdout.write("\n");
        }
    });
}
//# sourceMappingURL=ask.js.map