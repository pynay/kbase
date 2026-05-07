/**
 * llm.ts — LLM provider abstraction.
 *
 * Handles configuration loading, token budgeting, and streaming query
 * dispatch to the configured provider (Anthropic or OpenAI).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
// ---------------------------------------------------------------------------
// Constants — budgets and defaults
// ---------------------------------------------------------------------------
/** Conservative chars-per-token heuristic. Real tokenizers vary ~3.5-4.5. */
const CHARS_PER_TOKEN = 4;
/** Default output budget when the caller doesn't specify one. */
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
/**
 * Per-model context windows (input + output) in tokens. Used as the
 * budget ceiling when truncating prompts. Conservative defaults — a
 * specific model may have more, but we prefer a floor we know is safe.
 */
const CONTEXT_WINDOWS = {
    // Anthropic
    "claude-3-5-sonnet-latest": 200_000,
    "claude-3-5-haiku-latest": 200_000,
    "claude-sonnet-4-5": 200_000,
    "claude-opus-4-5": 200_000,
    // OpenAI
    "gpt-4o": 128_000,
    "gpt-4o-mini": 128_000,
    "gpt-4.1": 128_000,
};
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MODELS = {
    anthropic: "claude-sonnet-4-5",
    openai: "gpt-4o",
};
// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------
function configPath() {
    return path.join(os.homedir(), ".kbase", "config.json");
}
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
export async function loadConfig() {
    // 1. File (optional — missing file is not an error).
    let fileCfg = {};
    try {
        const raw = await fs.readFile(configPath(), "utf-8");
        fileCfg = JSON.parse(raw);
    }
    catch (err) {
        if (err.code !== "ENOENT")
            throw err;
    }
    // 2. Resolve provider. Env > file > default(anthropic).
    const providerRaw = process.env.KBASE_LLM_PROVIDER ?? fileCfg.provider ?? "anthropic";
    if (providerRaw !== "anthropic" && providerRaw !== "openai") {
        throw new Error(`Unknown LLM provider: ${providerRaw}. Expected "anthropic" or "openai".`);
    }
    const provider = providerRaw;
    // 3. Resolve api key — provider-specific env var, then file.
    const envKey = provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.OPENAI_API_KEY;
    const apiKey = envKey ?? fileCfg.apiKey;
    if (!apiKey) {
        const envName = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
        throw new Error(`No API key for ${provider}. Set ${envName} or add "apiKey" to ${configPath()}.`);
    }
    const model = process.env.KBASE_LLM_MODEL ?? fileCfg.model ?? DEFAULT_MODELS[provider];
    const baseUrl = process.env.KBASE_LLM_BASE_URL ?? fileCfg.baseUrl;
    return { provider, apiKey, model, baseUrl };
}
// ---------------------------------------------------------------------------
// Token budgeting
// ---------------------------------------------------------------------------
/**
 * Rough token estimate using a chars-per-token heuristic. Cheap and
 * dependency-free; off by ~20% vs. real tokenizers. Good enough for
 * guardrails, not good enough for billing.
 */
export function estimateTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
function contextWindowFor(model) {
    return CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
}
/**
 * Ensure `system + prompt + maxOutput` fits in the model's context window.
 * If the prompt is too long, truncates the *middle* of the prompt (keeping
 * head and tail) and inserts a marker. System prompts are preserved intact
 * since they usually encode essential instructions.
 *
 * Returns the possibly-truncated prompt. The system message is returned
 * unchanged — callers pass it through.
 */
export function fitPrompt(model, system, prompt, maxOutputTokens) {
    const window = contextWindowFor(model);
    // Leave 5% headroom for tokenizer slop and message-envelope overhead.
    const budget = Math.floor(window * 0.95) - maxOutputTokens;
    const systemTokens = estimateTokens(system);
    const promptTokens = estimateTokens(prompt);
    if (systemTokens + promptTokens <= budget)
        return prompt;
    const available = budget - systemTokens;
    if (available <= 0) {
        throw new Error(`System prompt alone (${systemTokens} tokens) exceeds budget ` +
            `(${budget} tokens) for model ${model}.`);
    }
    // Keep head and tail of the prompt, drop the middle. The head usually
    // carries the question/intent and the tail carries the most recent
    // context — the middle is the most disposable.
    const availableChars = available * CHARS_PER_TOKEN;
    const marker = "\n\n[... truncated to fit context window ...]\n\n";
    const keep = availableChars - marker.length;
    if (keep <= 0) {
        throw new Error(`Context window too small to fit prompt for ${model}.`);
    }
    const headChars = Math.floor(keep * 0.6);
    const tailChars = keep - headChars;
    return prompt.slice(0, headChars) + marker + prompt.slice(-tailChars);
}
// ---------------------------------------------------------------------------
// Streaming query
// ---------------------------------------------------------------------------
/**
 * Send a streaming query to the configured LLM. Yields text chunks as
 * they arrive. Callers can either `for await` over the chunks or funnel
 * through `querySync` below for a single string.
 */
export async function* query(config, request) {
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    const prompt = fitPrompt(config.model, request.system, request.prompt, maxTokens);
    if (config.provider === "anthropic") {
        yield* streamAnthropic(config, request.system, prompt, maxTokens);
    }
    else {
        yield* streamOpenAI(config, request.system, prompt, maxTokens);
    }
}
/**
 * Send a query and return the full response as a single string. Built
 * on top of `query()` so both code paths share the same streaming core.
 */
export async function querySync(config, request) {
    let out = "";
    for await (const chunk of query(config, request))
        out += chunk;
    return out;
}
// ---------------------------------------------------------------------------
// Provider: Anthropic (SDK-based)
// ---------------------------------------------------------------------------
async function* streamAnthropic(config, system, prompt, maxTokens) {
    const client = new Anthropic({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const stream = client.messages.stream({
        model: config.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
    });
    // The SDK emits text deltas via the "text" event; iterating the stream
    // itself yields low-level events, so we adapt via an async queue.
    for await (const event of stream) {
        if (event.type === "content_block_delta" &&
            event.delta.type === "text_delta") {
            yield event.delta.text;
        }
    }
}
// ---------------------------------------------------------------------------
// Provider: OpenAI (fetch + SSE — no extra dep)
// ---------------------------------------------------------------------------
async function* streamOpenAI(config, system, prompt, maxTokens) {
    const base = (config.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    const url = `${base}/v1/chat/completions`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            max_tokens: maxTokens,
            stream: true,
            messages: [
                { role: "system", content: system },
                { role: "user", content: prompt },
            ],
        }),
    });
    if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`OpenAI request failed (${res.status}): ${text}`);
    }
    // SSE framing: events separated by blank lines; each event has one or
    // more `data: ...` lines. Terminator is `data: [DONE]`.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { value, done } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        // Split on blank-line boundaries; keep the trailing partial in buffer.
        let sepIdx;
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            for (const line of rawEvent.split("\n")) {
                if (!line.startsWith("data:"))
                    continue;
                const data = line.slice(5).trim();
                if (data === "[DONE]")
                    return;
                if (!data)
                    continue;
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta)
                        yield delta;
                }
                catch {
                    // Malformed frame — skip rather than kill the stream.
                }
            }
        }
    }
}
//# sourceMappingURL=llm.js.map