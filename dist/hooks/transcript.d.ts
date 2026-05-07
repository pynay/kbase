export interface TranscriptMessage {
    role: "user" | "assistant";
    content: string;
    tool_calls?: Array<{
        name: string;
        input: unknown;
    }>;
}
export interface TranscriptTail {
    userPrompt: string;
    assistantContent: string;
    toolNames: string[];
    raw: string;
}
/**
 * Read a Claude Code JSONL transcript and extract the last user turn
 * through the last assistant turn.
 */
export declare function parseTranscriptTail(transcriptPath: string): Promise<TranscriptTail>;
export declare function hasToolCalls(toolNames: string[]): boolean;
//# sourceMappingURL=transcript.d.ts.map