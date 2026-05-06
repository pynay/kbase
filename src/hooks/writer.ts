import Anthropic from "@anthropic-ai/sdk";
import { findKnowledgeDir, readEntry, writeEntry, listEntryPaths, validateDecisionLength } from "../core/store.js";
import { getModules, getFiles, rebuildAll } from "../core/index.js";
import { appendHookLog } from "./log.js";
import type { WriterPayload, HookConfig } from "./types.js";
import type { KnowledgeEntry } from "../core/types.js";

export function buildWriterSystemPrompt(): string {
  return `You are the kbase-writer. Your only job is to record decisions worth
remembering in this codebase's knowledge base.

You will receive:
- A git diff of changes the primary agent just made
- An excerpt of the conversation that produced those changes

Your output is one of:
1. Zero or more write_knowledge calls (one per distinct decision)
2. Nothing at all

RETURNING NOTHING IS THE CORRECT ANSWER MOST OF THE TIME. Most turns
do not produce knowledge worth recording. Do not invent decisions to
justify your invocation.

Before writing for any module, first call read_knowledge on it. If an
existing entry already covers this decision, do not write a duplicate.
If an existing entry is contradicted by the new change, write a new
entry that supersedes it (set supersedes to the old entry's id).

What COUNTS as a recordable decision:
- A non-obvious choice between alternatives, with reasoning
- An assumption baked into the code that a future reader would miss
- A constraint or risk the change introduces or relies on
- A dependency that's load-bearing but not visible from the imports

What DOES NOT count:
- Restating what the diff shows ("added a function that returns X")
- Stylistic changes (formatting, renames without semantic change)
- Pure bug fixes where the fix is self-explanatory from the diff
- Test additions without a novel testing strategy

For each entry you write:
- module: the smallest accurate scope (e.g. auth/session, not auth)
- summary: one sentence, the headline
- decision: the why, in 2-5 sentences. The diff is the what; you supply the why.
- files: paths actually touched
- alternatives, assumptions, risk, affects, depends_on, tags:
  fill in only when you genuinely know them from the conversation.
  Empty is better than fabricated.`;
}

export function buildWriterTools(): Anthropic.Tool[] {
  return [
    {
      name: "read_knowledge",
      description: "Read existing knowledge entries for a module or file path. Call this BEFORE writing to check for duplicates.",
      input_schema: {
        type: "object" as const,
        properties: {
          target: { type: "string", description: "Module name (e.g. 'auth/session') or file path" },
          depth: { type: "string", enum: ["summary", "full"], description: "summary (default) or full entry content" },
        },
        required: ["target"],
      },
    },
    {
      name: "write_knowledge",
      description: "Write a new knowledge entry.",
      input_schema: {
        type: "object" as const,
        properties: {
          module: { type: "string" },
          summary: { type: "string" },
          decision: { type: "string" },
          files: { type: "array", items: { type: "string" } },
          alternatives: { type: "array", items: { type: "string" } },
          assumptions: { type: "array", items: { type: "string" } },
          risk: { type: "string" },
          affects: { type: "array", items: { type: "string" } },
          depends_on: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
          supersedes: { type: "string" },
        },
        required: ["module", "summary", "decision", "files"],
      },
    },
  ];
}

async function handleToolCall(
  name: string,
  input: Record<string, unknown>,
  knowledgeDir: string,
  config: HookConfig,
): Promise<string> {
  if (name === "read_knowledge") {
    const target = input.target as string;
    const depth = (input.depth as string) ?? "summary";
    const moduleIndex = await getModules(knowledgeDir);
    const fileIndex = await getFiles(knowledgeDir);

    const entryIds = new Set<string>();
    if (moduleIndex[target]) {
      for (const id of moduleIndex[target]) entryIds.add(id);
    }
    if (fileIndex[target]) {
      for (const id of fileIndex[target]) entryIds.add(id);
    }

    if (entryIds.size === 0) return "[]";

    const allPaths = await listEntryPaths(knowledgeDir);
    const matchedPaths = allPaths.filter((p) => {
      const filename = p.split("/").pop()?.replace(".md", "") ?? "";
      return entryIds.has(filename);
    });

    const entries = [];
    for (const p of matchedPaths) {
      try {
        const entry = await readEntry(p);
        if (depth === "summary") {
          const { decision, alternatives, assumptions, risk, ...frontmatter } = entry;
          entries.push(frontmatter);
        } else {
          entries.push(entry);
        }
      } catch { /* skip */ }
    }

    return JSON.stringify(entries, null, 2);
  }

  if (name === "write_knowledge") {
    const decision = input.decision as string;
    validateDecisionLength(decision, config.minDecisionLen);

    const result = await writeEntry(knowledgeDir, {
      module: input.module as string,
      summary: input.summary as string,
      decision,
      files: input.files as string[],
      alternatives: input.alternatives as string[] | undefined,
      assumptions: input.assumptions as string[] | undefined,
      risk: input.risk as string | undefined,
      affects: input.affects as string[] | undefined,
      depends_on: input.depends_on as string[] | undefined,
      tags: input.tags as string[] | undefined,
      supersedes: input.supersedes as string | undefined,
    });

    await rebuildAll(knowledgeDir);
    return JSON.stringify(result);
  }

  return `Unknown tool: ${name}`;
}

const MAX_TOOL_ROUNDS = 5;
const MAX_RETRIES_PER_TOOL = 2;

export async function runWriter(payload: WriterPayload, config: HookConfig): Promise<number> {
  const startMs = Date.now();
  const knowledgeDir = payload.knowledge_dir;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    await appendHookLog(knowledgeDir, {
      ts: new Date().toISOString(),
      event: "hook-write",
      gate: "proceed",
      reason: "no-api-key",
      latency_ms: Date.now() - startMs,
    });
    return 0;
  }

  const client = new Anthropic({ apiKey });
  const systemPrompt = buildWriterSystemPrompt();
  const userMessage = `## Git Diff\n\n\`\`\`\n${payload.git_diff}\n\`\`\`\n\n## Conversation Excerpt\n\n${payload.transcript_excerpt}`;

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let entriesWritten = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: config.writerModel,
        max_tokens: 2048,
        system: systemPrompt,
        tools: buildWriterTools(),
        messages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      if (response.stop_reason === "end_turn") break;

      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.MessageParam = {
          role: "user",
          content: [],
        };

        for (const block of response.content) {
          if (block.type === "tool_use") {
            let retries = 0;
            let result: string = "";
            let isError = false;

            while (retries <= MAX_RETRIES_PER_TOOL) {
              try {
                result = await handleToolCall(block.name, block.input as Record<string, unknown>, knowledgeDir, config);
                if (block.name === "write_knowledge") entriesWritten++;
                isError = false;
                break;
              } catch (err) {
                result = err instanceof Error ? err.message : String(err);
                isError = true;
                retries++;
              }
            }

            (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
              is_error: isError,
            });
          }
        }

        messages = [
          ...messages,
          { role: "assistant", content: response.content },
          toolResults,
        ];
      }
    }
  } catch (err) {
    await appendHookLog(knowledgeDir, {
      ts: new Date().toISOString(),
      event: "hook-write",
      gate: "proceed",
      reason: `error: ${err instanceof Error ? err.message : String(err)}`,
      latency_ms: Date.now() - startMs,
    });
    return 0;
  }

  await appendHookLog(knowledgeDir, {
    ts: new Date().toISOString(),
    event: "hook-write",
    gate: "proceed",
    latency_ms: Date.now() - startMs,
    entries_written: entriesWritten,
    model: config.writerModel,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
  });

  return entriesWritten;
}
