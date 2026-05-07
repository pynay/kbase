import Anthropic from "@anthropic-ai/sdk";
import type { WriterPayload, HookConfig } from "./types.js";
export declare function buildWriterSystemPrompt(): string;
export declare function buildWriterTools(): Anthropic.Tool[];
export declare function runWriter(payload: WriterPayload, config: HookConfig): Promise<number>;
//# sourceMappingURL=writer.d.ts.map