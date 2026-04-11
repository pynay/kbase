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

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { readAllEntries, writeEntry, resolveKnowledgeDir } from "../core/store.js";
import { rebuildAll, getDependencies, getModules, getFiles } from "../core/index.js";
import type { EntryFrontmatter, KnowledgeEntry } from "../core/types.js";

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
      "Read existing knowledge about a module or file. Call this before " +
      "making changes to understand existing decisions, assumptions, and " +
      "dependencies. Resolves the target against the _graph/ indexes: " +
      "first as a module name, then as a file path. Returns an empty array " +
      "if nothing matches.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description:
            "Module name (e.g. 'auth/session') or file path (e.g. 'src/auth/session.ts').",
        },
        depth: {
          type: "string",
          enum: ["summary", "full"],
          description:
            "summary = frontmatter-only per entry (cheap scan, omits decision body). " +
            "full = complete entry including decision, alternatives, assumptions, risk. " +
            "Defaults to summary.",
        },
      },
      required: ["target"],
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

/**
 * Project a full KnowledgeEntry down to its frontmatter — everything except
 * the free-form body sections. This is the `depth: "summary"` shape: enough
 * for an agent to decide which entries to fetch in full, without paying for
 * decision/alternatives/assumptions/risk on the scan pass.
 */
function toFrontmatter(entry: KnowledgeEntry): EntryFrontmatter {
  const { decision: _d, alternatives: _a, assumptions: _as, risk: _r, ...rest } = entry;
  return rest;
}

async function handleReadKnowledge(args: Record<string, unknown>) {
  const target = args.target;
  if (typeof target !== "string" || target.length === 0) {
    return errorContent("`target` must be a non-empty string.");
  }

  // Default to "summary" — the spec's default and the cheaper of the two.
  // Anything other than the two enum values silently falls back to summary
  // rather than erroring, so a slightly-wrong caller still gets useful data.
  const depth: "summary" | "full" = args.depth === "full" ? "full" : "summary";

  const knowledgeDir = await resolveKnowledgeDir();

  // Two-step lookup per the spec: module first, then file. We don't try both
  // and merge — if `target` is "auth/session" and that's a module name, we
  // want the module's entries, not every entry that happens to touch a file
  // path containing "auth/session".
  const modules = await getModules(knowledgeDir);
  let entryIds: string[] | null = null;
  if (Object.prototype.hasOwnProperty.call(modules, target)) {
    entryIds = modules[target];
  } else {
    const files = await getFiles(knowledgeDir);
    if (Object.prototype.hasOwnProperty.call(files, target)) {
      entryIds = files[target];
    }
  }

  // No match is a valid answer, not an error — lets agents call this
  // speculatively to check whether any knowledge exists before writing.
  if (entryIds === null || entryIds.length === 0) {
    return jsonContent([]);
  }

  // Resolve ids → full entries by walking all entries and filtering. At the
  // scale this tool targets (hundreds of entries), the O(n) walk is cheaper
  // than maintaining a separate id→path index. If this becomes a hot path
  // later, extend buildIndexes() with an id map.
  const idSet = new Set(entryIds);
  const allEntries = await readAllEntries(knowledgeDir);
  const matched = allEntries.filter((e) => idSet.has(e.id));

  // Newest first — same ordering the previous substring-search handler used,
  // and what an agent scanning summaries will expect.
  matched.sort((a, b) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return b.timestamp.localeCompare(a.timestamp);
  });

  const payload =
    depth === "full" ? matched : matched.map(toFrontmatter);

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

  // Rebuild every derived artifact (graph indexes + index.md) so both
  // query_deps and read_knowledge see the new entry on the very next call.
  await rebuildAll(knowledgeDir);

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
