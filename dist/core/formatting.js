/**
 * Formatting utilities for knowledge entries.
 *
 * Extracted from CLI to support hook-read context injection.
 */
/**
 * Format a knowledge entry as a markdown block suitable for dropping into
 * an LLM prompt. Includes identity (module, id, timestamp, agent), files,
 * and every narrative section that's populated.
 *
 * Used by hook-read to inject relevant knowledge into Claude's context.
 */
export function formatEntryForPrompt(e) {
    const parts = [];
    parts.push(`### ${e.module} — ${e.summary}`);
    parts.push(`ID: ${e.id}  •  ${e.timestamp}  •  by ${e.agent}`);
    if (e.files?.length)
        parts.push(`Files: ${e.files.join(", ")}`);
    if (e.affects?.length)
        parts.push(`Affects: ${e.affects.join(", ")}`);
    if (e.depends_on?.length)
        parts.push(`Depends on: ${e.depends_on.join(", ")}`);
    if (e.decision)
        parts.push(`\n**Decision**\n${e.decision}`);
    if (e.alternatives?.length) {
        parts.push(`\n**Alternatives**\n${e.alternatives.map((a) => `- ${a}`).join("\n")}`);
    }
    if (e.assumptions?.length) {
        parts.push(`\n**Assumptions**\n${e.assumptions.map((a) => `- ${a}`).join("\n")}`);
    }
    if (e.risk)
        parts.push(`\n**Risk**\n${e.risk}`);
    return parts.join("\n");
}
//# sourceMappingURL=formatting.js.map