import { readFile } from "node:fs/promises";
/**
 * Read a Claude Code JSONL transcript and extract the last user turn
 * through the last assistant turn.
 */
export async function parseTranscriptTail(transcriptPath) {
    let content;
    try {
        content = await readFile(transcriptPath, "utf-8");
    }
    catch {
        return { userPrompt: "", assistantContent: "", toolNames: [], raw: "" };
    }
    const lines = content
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);
    if (lines.length === 0) {
        return { userPrompt: "", assistantContent: "", toolNames: [], raw: "" };
    }
    const messages = [];
    for (const line of lines) {
        try {
            messages.push(JSON.parse(line));
        }
        catch {
            // skip malformed lines
        }
    }
    // Walk backwards to find last assistant, then last user before it
    let lastAssistant = null;
    let lastUser = null;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (!lastAssistant && messages[i].role === "assistant") {
            lastAssistant = messages[i];
        }
        if (lastAssistant && messages[i].role === "user") {
            lastUser = messages[i];
            break;
        }
    }
    const toolNames = (lastAssistant?.tool_calls ?? []).map((tc) => tc.name);
    const userPrompt = lastUser?.content ?? "";
    const assistantContent = lastAssistant?.content ?? "";
    const raw = [
        lastUser ? `User: ${userPrompt}` : "",
        lastAssistant ? `Assistant: ${assistantContent}` : "",
    ]
        .filter(Boolean)
        .join("\n\n");
    return { userPrompt, assistantContent, toolNames, raw };
}
/**
 * Check if the tool call list contains any write-class tools
 * (Edit, Write, Bash) that indicate the agent made changes.
 */
const WRITE_TOOLS = new Set(["Edit", "Write", "Bash", "NotebookEdit"]);
export function hasToolCalls(toolNames) {
    return toolNames.some((name) => WRITE_TOOLS.has(name));
}
//# sourceMappingURL=transcript.js.map