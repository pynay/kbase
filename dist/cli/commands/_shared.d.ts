/**
 * Shared helpers for CLI commands.
 *
 * Kept underscore-prefixed so it's obvious this isn't a command file —
 * commander only registers modules whose `register()` is imported in
 * cli/index.ts, so the name is cosmetic, but the convention helps when
 * scanning the directory.
 */
import type { KnowledgeEntry } from "../../core/types.js";
/**
 * Format a knowledge entry as a markdown block suitable for dropping into
 * an LLM prompt. Includes identity (module, id, timestamp, agent), files,
 * and every narrative section that's populated.
 *
 * Used by explain, impact, and ask — all three want the same shape so the
 * LLM sees consistent formatting regardless of which command is calling.
 * Extracted here to avoid three identical copies (and three places to
 * update if the shape needs to change).
 */
export declare function formatEntryForPrompt(e: KnowledgeEntry): string;
//# sourceMappingURL=_shared.d.ts.map