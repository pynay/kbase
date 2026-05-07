/**
 * Extract explicit file paths and backtick-quoted symbols from a prompt.
 * Returns raw strings — caller is responsible for resolving against indexes.
 */
export declare function extractExplicitPaths(prompt: string): string[];
/**
 * Build the prompt sent to Haiku for module classification.
 */
export declare function buildClassifierPrompt(userPrompt: string, moduleNames: string[]): string;
/**
 * Call Haiku to classify which modules are relevant to a prompt.
 * Returns an array of module name strings, or [] on any error.
 */
export declare function classifyModules(apiKey: string, userPrompt: string, moduleNames: string[]): Promise<string[]>;
//# sourceMappingURL=classifier.d.ts.map