/**
 * llm.ts — LLM provider abstraction.
 *
 * Handles configuration loading, token budgeting, and streaming query
 * dispatch to the configured provider (Anthropic or OpenAI).
 */
import type { LLMConfig, LLMRequest } from "./types.js";
/**
 * Load LLM configuration from ~/.kbase/config.json, then overlay environment
 * variables (which always win). Throws if no provider/api key can be resolved.
 *
 * Env vars:
 *   KBASE_LLM_PROVIDER   — "anthropic" | "openai"
 *   KBASE_LLM_MODEL      — model id
 *   KBASE_LLM_BASE_URL   — override base URL (useful for proxies/Azure)
 *   ANTHROPIC_API_KEY    — used when provider=anthropic
 *   OPENAI_API_KEY       — used when provider=openai
 */
export declare function loadConfig(): Promise<LLMConfig>;
/**
 * Rough token estimate using a chars-per-token heuristic. Cheap and
 * dependency-free; off by ~20% vs. real tokenizers. Good enough for
 * guardrails, not good enough for billing.
 */
export declare function estimateTokens(text: string): number;
/**
 * Ensure `system + prompt + maxOutput` fits in the model's context window.
 * If the prompt is too long, truncates the *middle* of the prompt (keeping
 * head and tail) and inserts a marker. System prompts are preserved intact
 * since they usually encode essential instructions.
 *
 * Returns the possibly-truncated prompt. The system message is returned
 * unchanged — callers pass it through.
 */
export declare function fitPrompt(model: string, system: string, prompt: string, maxOutputTokens: number): string;
/**
 * Send a streaming query to the configured LLM. Yields text chunks as
 * they arrive. Callers can either `for await` over the chunks or funnel
 * through `querySync` below for a single string.
 */
export declare function query(config: LLMConfig, request: LLMRequest): AsyncIterable<string>;
/**
 * Send a query and return the full response as a single string. Built
 * on top of `query()` so both code paths share the same streaming core.
 */
export declare function querySync(config: LLMConfig, request: LLMRequest): Promise<string>;
//# sourceMappingURL=llm.d.ts.map