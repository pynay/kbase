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
import type { Command } from "commander";
/**
 * Register the `kb ask <question>` subcommand.
 */
export declare function register(program: Command): void;
//# sourceMappingURL=ask.d.ts.map