/**
 * Extract explicit file paths and backtick-quoted symbols from a prompt.
 * Returns raw strings — caller is responsible for resolving against indexes.
 */
export function extractExplicitPaths(prompt) {
    const results = [];
    const pathRegex = /(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.\w+)/g;
    let match;
    while ((match = pathRegex.exec(prompt)) !== null) {
        results.push(match[1]);
    }
    const backtickRegex = /`([^`]+)`/g;
    while ((match = backtickRegex.exec(prompt)) !== null) {
        results.push(match[1]);
    }
    return results;
}
//# sourceMappingURL=path-extractor.js.map