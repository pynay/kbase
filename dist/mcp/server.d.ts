#!/usr/bin/env node
/**
 * server.ts — MCP server entry point.
 *
 * Exposes three tools over the Model Context Protocol:
 *   - read_knowledge: target-based lookup (module or file) against the _graph/ indexes
 *   - write_knowledge: add a new knowledge entry (auto-reindexes _graph/)
 *   - query_deps: query the module dependency graph
 *
 * This is a thin adapter over src/core/ — the same library the CLI sits
 * on. Both transports share the same behavior; no logic is duplicated.
 */
/**
 * Start the MCP server and register all tools.
 *
 * Uses stdio transport — the standard way MCP clients (Claude Desktop,
 * IDE integrations) spawn tool servers as subprocesses.
 */
export declare function startServer(): Promise<void>;
//# sourceMappingURL=server.d.ts.map