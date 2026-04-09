/**
 * llm.ts — LLM provider abstraction.
 *
 * Handles configuration loading and query dispatch to the configured
 * LLM provider (Anthropic or OpenAI).
 */

import type { LLMConfig, LLMRequest } from "./types.js";

/**
 * Load LLM configuration from ~/.kbase/config.json or environment variables.
 */
export function loadConfig(): LLMConfig {
  throw new Error("Not implemented");
}

/**
 * Send a streaming query to the configured LLM. Yields response chunks.
 */
export async function* query(
  config: LLMConfig,
  request: LLMRequest
): AsyncIterable<string> {
  throw new Error("Not implemented");
}

/**
 * Send a query and return the full response as a single string.
 */
export async function querySync(
  config: LLMConfig,
  request: LLMRequest
): Promise<string> {
  throw new Error("Not implemented");
}
