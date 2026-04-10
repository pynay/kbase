/**
 * server.ts — MCP server entry point.
 *
 * Exposes three tools over the Model Context Protocol:
 *   - read_knowledge: substring search over all knowledge entries
 *   - write_knowledge: add a new knowledge entry (auto-reindexes _graph/)
 *   - query_deps: query the module dependency graph
 *
 * This is a thin adapter over src/core/ — the same library the CLI sits
 * on. Both transports share the same behavior; no logic is duplicated.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { readAllEntries, writeEntry, resolveKnowledgeDir } from "../core/store.js";
import { buildIndexes, getDependencies } from "../core/index.js";
import { matchEntry } from "../core/search.js";
import type { KnowledgeEntry } from "../core/types.js";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
//
// Declared as a plain array so the ListTools handler can return it verbatim
// and the CallTool handler can dispatch on `name`. JSON Schema here is what
// the MCP SDK exposes to the client for input validation — keeping it tight
// helps calling LLMs produce well-formed arguments on the first try.

const TOOLS = [
  {
    name: "read_knowledge",
    description:
      "Substring search across all knowledge entries. Matches case-insensitively " +
      "against summary, decision, module, risk, alternatives, assumptions, and tags. " +
      "Returns hits sorted newest-first.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Substring to search for (case-insensitive, non-empty).",
        },
        limit: {
          type: "number",
          description: "Maximum number of hits to return. Defaults to 20.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "write_knowledge",
    description:
      "Create a new knowledge entry under .knowledge/<module>/<id>.md. " +
      "Generates a UUID and timestamp automatically and rebuilds the " +
      "_graph/ indexes so query_deps immediately sees the new entry.",
    inputSchema: {
      type: "object",
      properties: {
        module: { type: "string", description: "Module this entry belongs to." },
        summary: { type: "string", description: "One-line summary of the entry." },
        decision: { type: "string", description: "The decision/narrative body." },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Source files this entry describes.",
        },
        alternatives: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" } },
        risk: { type: "string" },
        affects: { type: "array", items: { type: "string" } },
        depends_on: {
          type: "array",
          items: { type: "string" },
          description: "Other modules this entry depends on.",
        },
        tags: { type: "array", items: { type: "string" } },
        agent: {
          type: "string",
          description: "Identifier of the agent writing the entry. Defaults to 'unknown'.",
        },
      },
      required: ["module", "summary", "decision", "files"],
    },
  },
  {
    name: "query_deps",
    description:
      "Look up a module in the dependency graph. Returns upstream " +
      "dependencies (depends_on), downstream dependents (depended_on_by), " +
      "or both, depending on `direction`.",
    inputSchema: {
      type: "object",
      properties: {
        module: { type: "string", description: "Module name to look up." },
        direction: {
          type: "string",
          enum: ["up", "down", "both"],
          description: "up = depends_on, down = depended_on_by, both = both. Default: both.",
        },
      },
      required: ["module"],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** Wrap a JSON-serializable payload in the MCP content-array response shape. */
function jsonContent(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/** Wrap a human-readable error string as an MCP error response. */
function errorContent(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleReadKnowledge(args: Record<string, unknown>) {
  const query = args.query;
  if (typeof query !== "string" || query.length === 0) {
    return errorContent("`query` must be a non-empty string.");
  }
  const limit = typeof args.limit === "number" && args.limit > 0 ? args.limit : 20;

  const knowledgeDir = await resolveKnowledgeDir();
  const entries = await readAllEntries(knowledgeDir);

  const needleLower = query.toLowerCase();
  const hits = [];
  for (const entry of entries) {
    const hit = matchEntry(entry, needleLower);
    if (hit) hits.push(hit);
  }

  // Newest first — mirrors the CLI's `kb search` ordering so both transports
  // return results in the same order for the same query.
  hits.sort((a, b) => {
    if (!a.entry.timestamp) return 1;
    if (!b.entry.timestamp) return -1;
    return b.entry.timestamp.localeCompare(a.entry.timestamp);
  });

  const payload = hits.slice(0, limit).map((h) => ({
    id: h.entry.id,
    module: h.entry.module,
    summary: h.entry.summary,
    timestamp: h.entry.timestamp,
    field: h.field,
    snippet: h.snippet,
  }));

  return jsonContent(payload);
}

async function handleWriteKnowledge(args: Record<string, unknown>) {
  // Validate the four required fields explicitly so we return a clean MCP
  // error instead of a cryptic core-library stack trace.
  const required = ["module", "summary", "decision", "files"] as const;
  for (const key of required) {
    if (args[key] === undefined) {
      return errorContent(`Missing required field: ${key}`);
    }
  }
  if (!Array.isArray(args.files) || !(args.files as unknown[]).every((f) => typeof f === "string")) {
    return errorContent("`files` must be an array of strings.");
  }

  const knowledgeDir = await resolveKnowledgeDir();

  const entryInput: Omit<KnowledgeEntry, "id" | "timestamp" | "agent"> & { agent?: string } = {
    module: args.module as string,
    summary: args.summary as string,
    decision: args.decision as string,
    files: args.files as string[],
    alternatives: args.alternatives as string[] | undefined,
    assumptions: args.assumptions as string[] | undefined,
    risk: args.risk as string | undefined,
    affects: args.affects as string[] | undefined,
    depends_on: args.depends_on as string[] | undefined,
    tags: args.tags as string[] | undefined,
    agent: args.agent as string | undefined,
  };

  const { id, path } = await writeEntry(knowledgeDir, entryInput);

  // Rebuild _graph/ so query_deps sees the new entry on the very next call.
  // See plan: there's no `kb reindex` implemented today, so auto-reindex is
  // the only way to keep the dependency graph consistent with the markdown.
  await buildIndexes(knowledgeDir);

  return jsonContent({ id, path });
}

async function handleQueryDeps(args: Record<string, unknown>) {
  const module = args.module;
  if (typeof module !== "string" || module.length === 0) {
    return errorContent("`module` must be a non-empty string.");
  }

  const rawDirection = args.direction;
  const direction: "up" | "down" | "both" =
    rawDirection === "up" || rawDirection === "down" ? rawDirection : "both";

  const knowledgeDir = await resolveKnowledgeDir();
  const deps = await getDependencies(knowledgeDir);
  const node = deps[module];
  if (!node) {
    return errorContent(
      `Module "${module}" not found in the dependency index. ` +
        `It may not exist, or the index may be stale — try writing an entry for it first.`
    );
  }

  const payload: Record<string, unknown> = { module };
  if (direction === "up" || direction === "both") {
    payload.depends_on = node.depends_on;
  }
  if (direction === "down" || direction === "both") {
    payload.depended_on_by = node.depended_on_by;
  }

  return jsonContent(payload);
}

// ---------------------------------------------------------------------------
// Server wiring
// ---------------------------------------------------------------------------

/**
 * Start the MCP server and register all tools.
 *
 * Uses stdio transport — the standard way MCP clients (Claude Desktop,
 * IDE integrations) spawn tool servers as subprocesses.
 */
export async function startServer(): Promise<void> {
  const server = new Server(
    { name: "kbase", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({ ...t })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const input = (args ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case "read_knowledge":
          return await handleReadKnowledge(input);
        case "write_knowledge":
          return await handleWriteKnowledge(input);
        case "query_deps":
          return await handleQueryDeps(input);
        default:
          return errorContent(`Unknown tool: ${name}`);
      }
    } catch (err) {
      // Catch-all so one bad call doesn't tear down the server. The most
      // common cause is resolveKnowledgeDir() throwing when .knowledge/
      // doesn't exist — surface that to the caller instead of crashing.
      const message = err instanceof Error ? err.message : String(err);
      return errorContent(`Tool "${name}" failed: ${message}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Self-start when invoked directly (e.g. via the `kb-mcp` bin from package.json).
// The import.meta.url check means `import { startServer } from "./server.js"`
// from tests won't accidentally boot the server.
const invokedUrl = import.meta.url;
const entryUrl = process.argv[1] ? new URL(`file://${process.argv[1]}`).href : "";
if (invokedUrl === entryUrl) {
  startServer().catch((err) => {
    console.error("Failed to start kbase MCP server:", err);
    process.exit(1);
  });
}
