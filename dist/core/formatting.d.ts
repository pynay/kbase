/**
 * Formatting utilities for knowledge entries.
 *
 * Extracted from CLI to support hook-read context injection.
 */
import type { KnowledgeEntry } from "./types.js";
/**
 * Format a knowledge entry as a markdown block suitable for dropping into
 * an LLM prompt. Includes identity (module, id, timestamp, agent), files,
 * and every narrative section that's populated.
 *
 * Used by hook-read to inject relevant knowledge into Claude's context.
 */
export declare function formatEntryForPrompt(e: KnowledgeEntry): string;
//# sourceMappingURL=formatting.d.ts.map