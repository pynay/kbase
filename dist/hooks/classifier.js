import Anthropic from "@anthropic-ai/sdk";
/**
 * Extract explicit file paths and backtick-quoted symbols from a prompt.
 * Returns raw strings — caller is responsible for resolving against indexes.
 */
export function extractExplicitPaths(prompt) {
    const results = [];
    // File paths: word characters, slashes, dots, hyphens ending in a file extension
    const pathRegex = /(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.\w+)/g;
    let match;
    while ((match = pathRegex.exec(prompt)) !== null) {
        results.push(match[1]);
    }
    // Backtick-quoted symbols: `something`
    const backtickRegex = /`([^`]+)`/g;
    while ((match = backtickRegex.exec(prompt)) !== null) {
        results.push(match[1]);
    }
    return results;
}
/**
 * Build the prompt sent to Haiku for module classification.
 */
export function buildClassifierPrompt(userPrompt, moduleNames) {
    return `You are a classifier. Given a user's prompt and a list of codebase module names, return a JSON array of module names that are likely relevant to the user's request. Return [] if none are relevant. Return at most 3 modules.

Modules:
${moduleNames.map((m) => `- ${m}`).join("\n")}

User prompt: "${userPrompt}"

Respond with ONLY a JSON array of strings. No explanation.`;
}
/**
 * Call Haiku to classify which modules are relevant to a prompt.
 * Returns an array of module name strings, or [] on any error.
 */
export async function classifyModules(apiKey, userPrompt, moduleNames) {
    if (moduleNames.length === 0)
        return [];
    const client = new Anthropic({ apiKey });
    const prompt = buildClassifierPrompt(userPrompt, moduleNames);
    try {
        const response = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 256,
            messages: [{ role: "user", content: prompt }],
        });
        const text = response.content[0].type === "text" ? response.content[0].text : "";
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed))
            return [];
        // Filter to only modules that actually exist in our list
        return parsed.filter((m) => typeof m === "string" && moduleNames.includes(m));
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=classifier.js.map