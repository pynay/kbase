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
export function formatEntryForPrompt(e: KnowledgeEntry): string {
  const parts: string[] = [];
  parts.push(`### ${e.module} — ${e.summary}`);
  parts.push(`ID: ${e.id}  •  ${e.timestamp}  •  by ${e.agent}`);
  if (e.files?.length) parts.push(`Files: ${e.files.join(", ")}`);
  if (e.affects?.length) parts.push(`Affects: ${e.affects.join(", ")}`);
  if (e.depends_on?.length) parts.push(`Depends on: ${e.depends_on.join(", ")}`);
  if (e.decision) parts.push(`\n**Decision**\n${e.decision}`);
  if (e.alternatives?.length) {
    parts.push(
      `\n**Alternatives**\n${e.alternatives.map((a) => `- ${a}`).join("\n")}`
    );
  }
  if (e.assumptions?.length) {
    parts.push(
      `\n**Assumptions**\n${e.assumptions.map((a) => `- ${a}`).join("\n")}`
    );
  }
  if (e.risk) parts.push(`\n**Risk**\n${e.risk}`);
  return parts.join("\n");
}
