# Deterministic kbase via Claude Code Hooks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move kbase reads and writes out of the primary agent's MCP discipline and into Claude Code hooks, so the harness injects knowledge automatically and a dedicated writer subprocess records decisions after every meaningful turn.

**Architecture:** Two Claude Code command hooks (`UserPromptSubmit` → `kb hook-read`, `Stop` → `kb hook-write`). `hook-read` does regex path extraction against existing indexes, falling back to a Haiku classifier. `hook-write` runs a cheap pre-filter and, when warranted, forks a detached Sonnet subprocess that calls `read_knowledge`/`write_knowledge` in-process. Both hooks fail silently — they never block the user's session.

**Tech Stack:** TypeScript (ES2022, Node16 modules), `@anthropic-ai/sdk`, `commander`, existing kbase `core/` internals (`store.ts`, `index.ts`, `search.ts`, `llm.ts`).

**Spec:** `docs/superpowers/specs/2026-04-15-deterministic-kb-hooks-design.md`

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `src/hooks/hook-read.ts` | `UserPromptSubmit` handler: parse stdin, gate, resolve entries, emit `additionalContext` |
| `src/hooks/hook-write.ts` | `Stop` handler: parse stdin, pre-filter, fork writer subprocess |
| `src/hooks/writer.ts` | Detached writer subprocess: Anthropic SDK call with narrow tool surface, dedupe gate, `write_knowledge` |
| `src/hooks/transcript.ts` | Transcript parser: read Claude Code's JSONL transcript, extract last turn, detect tool calls |
| `src/hooks/classifier.ts` | Haiku classifier: prompt + module index → relevant module names |
| `src/hooks/types.ts` | Shared types for hook payloads, writer config, transcript shapes |
| `src/hooks/log.ts` | Append-only JSON logger to `.knowledge/_cache/hook.log` |
| `tests/hooks/hook-read.test.ts` | Tests for read hook (gate, regex, classifier, output shape) |
| `tests/hooks/hook-write.test.ts` | Tests for write hook (gate, pre-filter, subprocess fork) |
| `tests/hooks/writer.test.ts` | Tests for writer subprocess (dedupe, quality bar, empty-output) |
| `tests/hooks/transcript.test.ts` | Tests for transcript parser |
| `tests/hooks/classifier.test.ts` | Tests for Haiku classifier |
| `tests/hooks/log.test.ts` | Tests for hook logger |

### Modified files

| File | Change |
|---|---|
| `src/cli/index.ts` | Register `hook-read` and `hook-write` commands (hidden from `--help`). Remove `assumptions`, `history`, `explain` registrations. |
| `src/cli/commands/init.ts` | Add `.claude/settings.json` hook wiring (additive merge). Add `--no-hooks` flag. |
| `src/cli/commands/ask.ts` | Absorb `explain`'s `--json` context-dump mode as `ask --json`. |
| `src/core/store.ts` | Add `validateDecisionLength(decision, minLen)` for schema-level quality floor. |
| `package.json` | Add `vitest` devDependency. Add `"test"` script. |
| `tsconfig.json` | No changes needed — `src/hooks/` is already under `rootDir: "./src"`. |

### Deleted files

| File | Reason |
|---|---|
| `src/cli/commands/assumptions.ts` | Subsumed by `kb ask`. |
| `src/cli/commands/history.ts` | Subsumed by `git log .knowledge/<module>/`. |
| `src/cli/commands/explain.ts` | Subsumed by `kb ask`. `--json` mode folded into `ask`. |

---

## Task 1: Test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test script to package.json**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify vitest runs (zero tests is OK)**

Run: `npx vitest run`
Expected: "No test files found" or "0 tests passed" — confirms the runner works.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test infrastructure"
```

---

## Task 2: Hook types and logger

Foundational types used by every subsequent task. Logger is simple enough to bundle here.

**Files:**
- Create: `src/hooks/types.ts`
- Create: `src/hooks/log.ts`
- Create: `tests/hooks/log.test.ts`

- [ ] **Step 1: Write the test for the logger**

Create `tests/hooks/log.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appendHookLog, HookLogEntry } from "../../src/hooks/log.js";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("appendHookLog", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `kbase-log-test-${Date.now()}`);
    await mkdir(join(dir, "_cache"), { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates hook.log and appends a JSON line", async () => {
    const entry: HookLogEntry = {
      ts: new Date().toISOString(),
      event: "hook-read",
      gate: "proceed",
      latency_ms: 42,
    };
    await appendHookLog(dir, entry);

    const content = await readFile(join(dir, "_cache", "hook.log"), "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.event).toBe("hook-read");
    expect(parsed.gate).toBe("proceed");
    expect(parsed.latency_ms).toBe(42);
  });

  it("appends multiple entries as newline-delimited JSON", async () => {
    await appendHookLog(dir, { ts: "a", event: "hook-read", gate: "skip" });
    await appendHookLog(dir, { ts: "b", event: "hook-write", gate: "proceed" });

    const lines = (await readFile(join(dir, "_cache", "hook.log"), "utf-8"))
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).event).toBe("hook-read");
    expect(JSON.parse(lines[1]).event).toBe("hook-write");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hooks/log.test.ts`
Expected: FAIL — module `../../src/hooks/log.js` not found.

- [ ] **Step 3: Create hook types**

Create `src/hooks/types.ts`:

```typescript
/**
 * Payload Claude Code pipes to UserPromptSubmit hooks via stdin.
 */
export interface UserPromptSubmitPayload {
  session_id: string;
  transcript_path: string;
  cwd: string;
  prompt: string;
}

/**
 * Payload Claude Code pipes to Stop hooks via stdin.
 */
export interface StopPayload {
  session_id: string;
  transcript_path: string;
  cwd: string;
  stop_hook_active: boolean;
}

/**
 * Response shape for UserPromptSubmit hooks that inject context.
 */
export interface UserPromptSubmitResponse {
  hookSpecificOutput: {
    additionalContext: string;
  };
}

/**
 * Config for the kbase-writer subprocess, passed as serialized JSON arg.
 */
export interface WriterPayload {
  transcript_excerpt: string;
  git_diff: string;
  cwd: string;
  knowledge_dir: string;
}

/**
 * Env-var-driven config for hook behavior.
 */
export interface HookConfig {
  disabled: boolean;
  writerModel: string;
  minDecisionLen: number;
  hookLogPath: string | null; // null = use default
}

export function loadHookConfig(): HookConfig {
  return {
    disabled: process.env.KBASE_HOOKS_DISABLED === "1",
    writerModel: process.env.KBASE_WRITER_MODEL ?? "claude-sonnet-4-5",
    minDecisionLen: parseInt(process.env.KBASE_MIN_DECISION_LEN ?? "80", 10),
    hookLogPath: process.env.KBASE_HOOK_LOG ?? null,
  };
}
```

- [ ] **Step 4: Create logger**

Create `src/hooks/log.ts`:

```typescript
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface HookLogEntry {
  ts: string;
  event: "hook-read" | "hook-write";
  gate: "proceed" | "skip";
  reason?: string;
  latency_ms?: number;
  entries_written?: number;
  entries_injected?: number;
  resolution?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
}

export async function appendHookLog(
  knowledgeDir: string,
  entry: HookLogEntry,
): Promise<void> {
  const cacheDir = join(knowledgeDir, "_cache");
  await mkdir(cacheDir, { recursive: true });
  const logPath = join(cacheDir, "hook.log");
  await appendFile(logPath, JSON.stringify(entry) + "\n", "utf-8");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/hooks/log.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/types.ts src/hooks/log.ts tests/hooks/log.test.ts
git commit -m "feat: add hook types and append-only hook logger"
```

---

## Task 3: Transcript parser

Reads Claude Code's JSONL transcript and extracts the last turn. Used by both hooks.

**Files:**
- Create: `src/hooks/transcript.ts`
- Create: `tests/hooks/transcript.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/hooks/transcript.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseTranscriptTail,
  hasToolCalls,
  TranscriptMessage,
} from "../../src/hooks/transcript.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("parseTranscriptTail", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `kbase-transcript-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    filePath = join(dir, "transcript.jsonl");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns the last user and assistant messages", async () => {
    const lines = [
      JSON.stringify({ role: "user", content: "first question" }),
      JSON.stringify({ role: "assistant", content: "first answer", tool_calls: [] }),
      JSON.stringify({ role: "user", content: "second question" }),
      JSON.stringify({
        role: "assistant",
        content: "second answer",
        tool_calls: [{ name: "Edit", input: {} }],
      }),
    ];
    await writeFile(filePath, lines.join("\n") + "\n");

    const tail = await parseTranscriptTail(filePath);
    expect(tail.userPrompt).toBe("second question");
    expect(tail.assistantContent).toContain("second answer");
  });

  it("returns empty strings for an empty transcript", async () => {
    await writeFile(filePath, "");
    const tail = await parseTranscriptTail(filePath);
    expect(tail.userPrompt).toBe("");
    expect(tail.assistantContent).toBe("");
    expect(tail.toolNames).toEqual([]);
  });
});

describe("hasToolCalls", () => {
  it("returns true when edit-class tools are present", () => {
    expect(hasToolCalls(["Edit", "Read"])).toBe(true);
    expect(hasToolCalls(["Write"])).toBe(true);
    expect(hasToolCalls(["Bash"])).toBe(true);
  });

  it("returns false for read-only tools", () => {
    expect(hasToolCalls(["Read", "Glob", "Grep"])).toBe(false);
  });

  it("returns false for empty list", () => {
    expect(hasToolCalls([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hooks/transcript.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement transcript parser**

Create `src/hooks/transcript.ts`:

```typescript
import { readFile } from "node:fs/promises";

export interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
  tool_calls?: Array<{ name: string; input: unknown }>;
}

export interface TranscriptTail {
  userPrompt: string;
  assistantContent: string;
  toolNames: string[];
  raw: string; // the last user+assistant messages concatenated for the writer
}

/**
 * Read a Claude Code JSONL transcript and extract the last user turn
 * through the last assistant turn.
 */
export async function parseTranscriptTail(
  transcriptPath: string,
): Promise<TranscriptTail> {
  let content: string;
  try {
    content = await readFile(transcriptPath, "utf-8");
  } catch {
    return { userPrompt: "", assistantContent: "", toolNames: [], raw: "" };
  }

  const lines = content
    .trim()
    .split("\n")
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { userPrompt: "", assistantContent: "", toolNames: [], raw: "" };
  }

  const messages: TranscriptMessage[] = [];
  for (const line of lines) {
    try {
      messages.push(JSON.parse(line) as TranscriptMessage);
    } catch {
      // skip malformed lines
    }
  }

  // Walk backwards to find last assistant, then last user before it
  let lastAssistant: TranscriptMessage | null = null;
  let lastUser: TranscriptMessage | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    if (!lastAssistant && messages[i].role === "assistant") {
      lastAssistant = messages[i];
    }
    if (lastAssistant && messages[i].role === "user") {
      lastUser = messages[i];
      break;
    }
  }

  const toolNames = (lastAssistant?.tool_calls ?? []).map((tc) => tc.name);
  const userPrompt = lastUser?.content ?? "";
  const assistantContent = lastAssistant?.content ?? "";
  const raw = [
    lastUser ? `User: ${userPrompt}` : "",
    lastAssistant ? `Assistant: ${assistantContent}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { userPrompt, assistantContent, toolNames, raw };
}

/**
 * Check if the tool call list contains any write-class tools
 * (Edit, Write, Bash) that indicate the agent made changes.
 */
const WRITE_TOOLS = new Set(["Edit", "Write", "Bash", "NotebookEdit"]);

export function hasToolCalls(toolNames: string[]): boolean {
  return toolNames.some((name) => WRITE_TOOLS.has(name));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hooks/transcript.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/transcript.ts tests/hooks/transcript.test.ts
git commit -m "feat: add transcript parser for hook event processing"
```

---

## Task 4: Haiku classifier

Given a user prompt and the module index, returns which modules are relevant.

**Files:**
- Create: `src/hooks/classifier.ts`
- Create: `tests/hooks/classifier.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/hooks/classifier.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  extractExplicitPaths,
  buildClassifierPrompt,
} from "../../src/hooks/classifier.js";

describe("extractExplicitPaths", () => {
  it("extracts file paths from a prompt", () => {
    const paths = extractExplicitPaths(
      "fix the bug in src/auth/session.ts and check src/core/store.ts",
    );
    expect(paths).toContain("src/auth/session.ts");
    expect(paths).toContain("src/core/store.ts");
  });

  it("extracts backtick-quoted symbols", () => {
    const paths = extractExplicitPaths("what does `parseEntry` do?");
    expect(paths).toContain("parseEntry");
  });

  it("returns empty array for no matches", () => {
    expect(extractExplicitPaths("fix the login bug")).toEqual([]);
  });

  it("handles paths with directories", () => {
    const paths = extractExplicitPaths("look at src/hooks/writer.ts");
    expect(paths).toContain("src/hooks/writer.ts");
  });
});

describe("buildClassifierPrompt", () => {
  it("includes the user prompt and module list", () => {
    const prompt = buildClassifierPrompt("fix login bug", [
      "auth/session",
      "core/store",
      "mcp/server",
    ]);
    expect(prompt).toContain("fix login bug");
    expect(prompt).toContain("auth/session");
    expect(prompt).toContain("core/store");
  });

  it("returns a prompt asking for JSON array output", () => {
    const prompt = buildClassifierPrompt("test", ["mod/a"]);
    expect(prompt).toContain("JSON");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hooks/classifier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement classifier**

Create `src/hooks/classifier.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";

/**
 * Extract explicit file paths and backtick-quoted symbols from a prompt.
 * Returns raw strings — caller is responsible for resolving against indexes.
 */
export function extractExplicitPaths(prompt: string): string[] {
  const results: string[] = [];

  // File paths: word characters, slashes, dots, hyphens ending in a file extension
  const pathRegex = /(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.\w+)/g;
  let match: RegExpExecArray | null;
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
export function buildClassifierPrompt(
  userPrompt: string,
  moduleNames: string[],
): string {
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
export async function classifyModules(
  apiKey: string,
  userPrompt: string,
  moduleNames: string[],
): Promise<string[]> {
  if (moduleNames.length === 0) return [];

  const client = new Anthropic({ apiKey });
  const prompt = buildClassifierPrompt(userPrompt, moduleNames);

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) return [];
    // Filter to only modules that actually exist in our list
    return parsed.filter(
      (m: unknown): m is string =>
        typeof m === "string" && moduleNames.includes(m),
    );
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hooks/classifier.test.ts`
Expected: PASS — all tests pass. (Note: `classifyModules` itself is not unit-tested because it calls the Anthropic API. The pure functions `extractExplicitPaths` and `buildClassifierPrompt` are tested.)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/classifier.ts tests/hooks/classifier.test.ts
git commit -m "feat: add Haiku classifier for hook-read module resolution"
```

---

## Task 5: `kb hook-read` command

The UserPromptSubmit hook entry point. Reads stdin, gates, resolves entries, emits `additionalContext`.

**Files:**
- Create: `src/hooks/hook-read.ts`
- Create: `src/cli/commands/hook-read.ts`
- Modify: `src/cli/index.ts`
- Create: `tests/hooks/hook-read.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/hooks/hook-read.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { processReadHook } from "../../src/hooks/hook-read.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeEntry } from "../../src/core/store.js";
import { rebuildAll } from "../../src/core/index.js";

describe("processReadHook", () => {
  let knowledgeDir: string;
  let projectDir: string;

  beforeEach(async () => {
    projectDir = join(tmpdir(), `kbase-hookread-test-${Date.now()}`);
    knowledgeDir = join(projectDir, ".knowledge");
    await mkdir(join(knowledgeDir, "_graph"), { recursive: true });
    await mkdir(join(knowledgeDir, "_cache"), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it("returns null when .knowledge/ does not exist", async () => {
    const result = await processReadHook({
      prompt: "fix the bug",
      cwd: "/nonexistent",
      apiKey: null,
    });
    expect(result).toBeNull();
  });

  it("resolves entries by explicit file path in the prompt", async () => {
    await writeEntry(knowledgeDir, {
      module: "auth/session",
      summary: "Session tokens use JWT",
      decision: "We chose JWT for session tokens because they are stateless and verifiable without a database lookup.",
      files: ["src/auth/session.ts"],
    });
    await rebuildAll(knowledgeDir);

    const result = await processReadHook({
      prompt: "fix the bug in src/auth/session.ts",
      cwd: projectDir,
      apiKey: null,
    });

    expect(result).not.toBeNull();
    expect(result!.additionalContext).toContain("Session tokens use JWT");
  });

  it("caps output at 3 entries", async () => {
    for (let i = 0; i < 5; i++) {
      await writeEntry(knowledgeDir, {
        module: "auth/session",
        summary: `Decision ${i}`,
        decision: `This is a detailed decision number ${i} that explains the reasoning behind the choice.`,
        files: ["src/auth/session.ts"],
      });
    }
    await rebuildAll(knowledgeDir);

    const result = await processReadHook({
      prompt: "fix the bug in src/auth/session.ts",
      cwd: projectDir,
      apiKey: null,
    });

    // Count occurrences of "## " which marks entry boundaries
    const entryCount = (result!.additionalContext.match(/---/g) || []).length;
    // At most 3 entries means at most 3 separator markers (could be fewer depending on formatting)
    expect(entryCount).toBeLessThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hooks/hook-read.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook-read core logic**

Create `src/hooks/hook-read.ts`:

```typescript
import { findKnowledgeDir, readEntry } from "../core/store.js";
import { getModules, getFiles } from "../core/index.js";
import { formatEntryForPrompt } from "../cli/commands/_shared.js";
import { extractExplicitPaths, classifyModules } from "./classifier.js";
import { appendHookLog } from "./log.js";
import { loadHookConfig } from "./types.js";

interface ReadHookInput {
  prompt: string;
  cwd: string;
  apiKey: string | null;
}

interface ReadHookOutput {
  additionalContext: string;
}

const MAX_ENTRIES = 3;

/**
 * Core logic for hook-read. Separated from CLI/stdin wiring for testability.
 *
 * Returns null if there's nothing to inject (gate failed, no matches).
 * Never throws — returns null on any error.
 */
export async function processReadHook(
  input: ReadHookInput,
): Promise<ReadHookOutput | null> {
  const config = loadHookConfig();
  if (config.disabled) return null;

  const startMs = Date.now();
  let knowledgeDir: string | null;

  try {
    knowledgeDir = await findKnowledgeDir(input.cwd);
  } catch {
    return null;
  }
  if (!knowledgeDir) return null;

  try {
    const moduleIndex = await getModules(knowledgeDir);
    const fileIndex = await getFiles(knowledgeDir);
    const moduleNames = Object.keys(moduleIndex);

    if (moduleNames.length === 0) {
      await appendHookLog(knowledgeDir, {
        ts: new Date().toISOString(),
        event: "hook-read",
        gate: "skip",
        reason: "empty-index",
        latency_ms: Date.now() - startMs,
      });
      return null;
    }

    // Step 1: Try cheap path/symbol extraction
    const explicitPaths = extractExplicitPaths(input.prompt);
    const entryIds = new Set<string>();

    for (const path of explicitPaths) {
      // Try as file path
      if (fileIndex[path]) {
        for (const id of fileIndex[path]) entryIds.add(id);
      }
      // Try partial file path match (user says "session.ts", index has "src/auth/session.ts")
      for (const [indexedPath, ids] of Object.entries(fileIndex)) {
        if (indexedPath.endsWith(path) || indexedPath.includes(path)) {
          for (const id of ids) entryIds.add(id);
        }
      }
      // Try as module name
      if (moduleIndex[path]) {
        for (const id of moduleIndex[path]) entryIds.add(id);
      }
    }

    let resolution = "path-extraction";

    // Step 2: If we didn't find enough, try the Haiku classifier
    if (entryIds.size < 2 && input.apiKey) {
      const classifiedModules = await classifyModules(
        input.apiKey,
        input.prompt,
        moduleNames,
      );
      for (const mod of classifiedModules) {
        if (moduleIndex[mod]) {
          for (const id of moduleIndex[mod]) entryIds.add(id);
        }
      }
      if (classifiedModules.length > 0) {
        resolution = "classifier";
      }
    }

    if (entryIds.size === 0) {
      await appendHookLog(knowledgeDir, {
        ts: new Date().toISOString(),
        event: "hook-read",
        gate: "skip",
        reason: "no-matches",
        latency_ms: Date.now() - startMs,
      });
      return null;
    }

    // Resolve entry IDs to full entries, cap at MAX_ENTRIES
    const allEntryPaths = await listEntryPathsById(knowledgeDir, entryIds);
    const entries = [];
    for (const entryPath of allEntryPaths.slice(0, MAX_ENTRIES)) {
      try {
        entries.push(await readEntry(entryPath));
      } catch {
        // skip unreadable entries
      }
    }

    if (entries.length === 0) return null;

    const additionalContext = [
      "## Relevant kbase knowledge entries\n",
      ...entries.map(
        (e) => formatEntryForPrompt(e) + "\n---\n",
      ),
    ].join("\n");

    await appendHookLog(knowledgeDir, {
      ts: new Date().toISOString(),
      event: "hook-read",
      gate: "proceed",
      latency_ms: Date.now() - startMs,
      entries_injected: entries.length,
      resolution,
    });

    return { additionalContext };
  } catch {
    return null;
  }
}

/**
 * Given a set of entry IDs, find their file paths by scanning the knowledge dir.
 * Uses the module index to narrow the search.
 */
async function listEntryPathsById(
  knowledgeDir: string,
  entryIds: Set<string>,
): Promise<string[]> {
  const { listEntryPaths } = await import("../core/store.js");
  const allPaths = await listEntryPaths(knowledgeDir);
  // Entry files are named <uuid>.md — match against the entryIds set
  return allPaths.filter((p) => {
    const filename = p.split("/").pop()?.replace(".md", "") ?? "";
    return entryIds.has(filename);
  });
}
```

- [ ] **Step 4: Create the CLI command wrapper**

Create `src/cli/commands/hook-read.ts`:

```typescript
import { Command } from "commander";
import { processReadHook } from "../../hooks/hook-read.js";
import type { UserPromptSubmitPayload, UserPromptSubmitResponse } from "../../hooks/types.js";

export function register(program: Command): void {
  program
    .command("hook-read", { hidden: true })
    .description("(internal) UserPromptSubmit hook — inject kbase context")
    .action(async () => {
      try {
        const stdin = await readStdin();
        const payload: UserPromptSubmitPayload = JSON.parse(stdin);

        const apiKey =
          process.env.ANTHROPIC_API_KEY ??
          process.env.OPENAI_API_KEY ??
          null;

        const result = await processReadHook({
          prompt: payload.prompt,
          cwd: payload.cwd,
          apiKey,
        });

        if (result) {
          const response: UserPromptSubmitResponse = {
            hookSpecificOutput: {
              additionalContext: result.additionalContext,
            },
          };
          process.stdout.write(JSON.stringify(response));
        }
      } catch {
        // Fail silently — never block the user's prompt
      }
    });
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
    // If stdin is already closed (no pipe), resolve immediately
    if (process.stdin.readableEnded) resolve(data);
  });
}
```

- [ ] **Step 5: Register the command in CLI index**

In `src/cli/index.ts`, add the import and registration:

```typescript
import { register as registerHookRead } from "./commands/hook-read.js";
```

Add below existing registrations:

```typescript
registerHookRead(program);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/hooks/hook-read.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/hook-read.ts src/cli/commands/hook-read.ts src/cli/index.ts tests/hooks/hook-read.test.ts
git commit -m "feat: add kb hook-read command for UserPromptSubmit context injection"
```

---

## Task 6: Decision length validation in store

Add the schema-level quality floor before building the writer that depends on it.

**Files:**
- Modify: `src/core/store.ts`
- Create: `tests/core/store-validation.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/core/store-validation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateDecisionLength } from "../../src/core/store.js";

describe("validateDecisionLength", () => {
  it("passes for decisions at or above minimum length", () => {
    const decision = "A".repeat(80);
    expect(() => validateDecisionLength(decision, 80)).not.toThrow();
  });

  it("throws for decisions below minimum length", () => {
    expect(() => validateDecisionLength("Too short", 80)).toThrow(
      /decision must be at least 80 characters/,
    );
  });

  it("uses default minimum of 80 when not specified", () => {
    expect(() => validateDecisionLength("Too short")).toThrow();
    expect(() =>
      validateDecisionLength("A".repeat(80)),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/store-validation.test.ts`
Expected: FAIL — `validateDecisionLength` not exported.

- [ ] **Step 3: Add validation function to store.ts**

In `src/core/store.ts`, add and export:

```typescript
/**
 * Schema-level quality floor for knowledge entry decisions.
 * Throws if the decision text is below the minimum length.
 */
export function validateDecisionLength(
  decision: string,
  minLen: number = 80,
): void {
  if (decision.length < minLen) {
    throw new Error(
      `decision must be at least ${minLen} characters (got ${decision.length}). ` +
        `If this change isn't worth a detailed explanation, it may not be worth a knowledge entry.`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/store-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts tests/core/store-validation.test.ts
git commit -m "feat: add decision length validation to knowledge store"
```

---

## Task 7: kbase-writer subprocess

The fire-and-forget Sonnet subprocess that decides what to record and calls `write_knowledge`.

**Files:**
- Create: `src/hooks/writer.ts`
- Create: `tests/hooks/writer.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/hooks/writer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildWriterSystemPrompt, buildWriterTools } from "../../src/hooks/writer.js";

describe("buildWriterSystemPrompt", () => {
  it("contains the empty-output instruction", () => {
    const prompt = buildWriterSystemPrompt();
    expect(prompt).toContain("RETURNING NOTHING IS THE CORRECT ANSWER MOST OF THE TIME");
  });

  it("contains dedupe instructions", () => {
    const prompt = buildWriterSystemPrompt();
    expect(prompt).toContain("read_knowledge");
    expect(prompt).toContain("duplicate");
  });

  it("contains the quality criteria", () => {
    const prompt = buildWriterSystemPrompt();
    expect(prompt).toContain("non-obvious choice");
    expect(prompt).toContain("assumption baked into the code");
  });
});

describe("buildWriterTools", () => {
  it("exposes exactly two tools", () => {
    const tools = buildWriterTools();
    expect(tools).toHaveLength(2);
    const names = tools.map((t) => t.name);
    expect(names).toContain("read_knowledge");
    expect(names).toContain("write_knowledge");
  });

  it("write_knowledge requires module, summary, decision, files", () => {
    const tools = buildWriterTools();
    const writeTool = tools.find((t) => t.name === "write_knowledge")!;
    const required = writeTool.input_schema.required as string[];
    expect(required).toContain("module");
    expect(required).toContain("summary");
    expect(required).toContain("decision");
    expect(required).toContain("files");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hooks/writer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the writer**

Create `src/hooks/writer.ts`:

```typescript
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
      description:
        "Read existing knowledge entries for a module or file path. Call this BEFORE writing to check for duplicates.",
      input_schema: {
        type: "object" as const,
        properties: {
          target: {
            type: "string",
            description: "Module name (e.g. 'auth/session') or file path",
          },
          depth: {
            type: "string",
            enum: ["summary", "full"],
            description: "summary (default) or full entry content",
          },
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

/**
 * Handle a tool call from the writer LLM.
 * Returns the text result to feed back to the LLM.
 */
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
      } catch {
        // skip
      }
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

/**
 * Run the kbase-writer. Called from the detached subprocess.
 * Performs the Anthropic SDK conversation loop with tool use.
 */
export async function runWriter(
  payload: WriterPayload,
  config: HookConfig,
): Promise<number> {
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

      // If the model stopped without tool use, we're done
      if (response.stop_reason === "end_turn") break;

      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.MessageParam = {
          role: "user",
          content: [],
        };

        for (const block of response.content) {
          if (block.type === "tool_use") {
            let retries = 0;
            let result: string;
            let isError = false;

            while (retries <= MAX_RETRIES_PER_TOOL) {
              try {
                result = await handleToolCall(
                  block.name,
                  block.input as Record<string, unknown>,
                  knowledgeDir,
                  config,
                );
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
              content: result!,
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hooks/writer.test.ts`
Expected: PASS — `buildWriterSystemPrompt` and `buildWriterTools` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/writer.ts tests/hooks/writer.test.ts
git commit -m "feat: add kbase-writer subprocess with Anthropic SDK tool loop"
```

---

## Task 8: `kb hook-write` command

The Stop hook entry point. Pre-filters, then forks the writer subprocess.

**Files:**
- Create: `src/hooks/hook-write.ts`
- Create: `src/cli/commands/hook-write.ts`
- Modify: `src/cli/index.ts`
- Create: `tests/hooks/hook-write.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/hooks/hook-write.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { shouldProceed } from "../../src/hooks/hook-write.js";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("shouldProceed", () => {
  let projectDir: string;
  let knowledgeDir: string;

  beforeEach(async () => {
    projectDir = join(tmpdir(), `kbase-hookwrite-test-${Date.now()}`);
    knowledgeDir = join(projectDir, ".knowledge");
    await mkdir(knowledgeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it("returns false when stop_hook_active is true", async () => {
    const result = await shouldProceed({
      stop_hook_active: true,
      cwd: projectDir,
      hasGitDiff: false,
      hasWriteToolCalls: false,
    });
    expect(result.proceed).toBe(false);
    expect(result.reason).toBe("stop-hook-active");
  });

  it("returns false when .knowledge/ does not exist", async () => {
    const result = await shouldProceed({
      stop_hook_active: false,
      cwd: "/nonexistent",
      hasGitDiff: false,
      hasWriteToolCalls: false,
    });
    expect(result.proceed).toBe(false);
    expect(result.reason).toBe("no-knowledge-dir");
  });

  it("returns false when no diff and no write tool calls", async () => {
    const result = await shouldProceed({
      stop_hook_active: false,
      cwd: projectDir,
      hasGitDiff: false,
      hasWriteToolCalls: false,
    });
    expect(result.proceed).toBe(false);
    expect(result.reason).toBe("no-diff-no-edits");
  });

  it("returns true when git diff is present", async () => {
    const result = await shouldProceed({
      stop_hook_active: false,
      cwd: projectDir,
      hasGitDiff: true,
      hasWriteToolCalls: false,
    });
    expect(result.proceed).toBe(true);
  });

  it("returns true when write tool calls are present", async () => {
    const result = await shouldProceed({
      stop_hook_active: false,
      cwd: projectDir,
      hasGitDiff: false,
      hasWriteToolCalls: true,
    });
    expect(result.proceed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hooks/hook-write.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook-write core logic**

Create `src/hooks/hook-write.ts`:

```typescript
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { findKnowledgeDir } from "../core/store.js";
import { parseTranscriptTail, hasToolCalls } from "./transcript.js";
import { appendHookLog } from "./log.js";
import { loadHookConfig } from "./types.js";
import type { StopPayload, WriterPayload } from "./types.js";

interface GateInput {
  stop_hook_active: boolean;
  cwd: string;
  hasGitDiff: boolean;
  hasWriteToolCalls: boolean;
}

interface GateResult {
  proceed: boolean;
  reason?: string;
}

/**
 * Determine whether the write hook should proceed.
 * Pure logic — no I/O except checking for .knowledge/ dir.
 */
export async function shouldProceed(input: GateInput): Promise<GateResult> {
  if (input.stop_hook_active) {
    return { proceed: false, reason: "stop-hook-active" };
  }

  const knowledgeDir = await findKnowledgeDir(input.cwd);
  if (!knowledgeDir) {
    return { proceed: false, reason: "no-knowledge-dir" };
  }

  if (!input.hasGitDiff && !input.hasWriteToolCalls) {
    return { proceed: false, reason: "no-diff-no-edits" };
  }

  return { proceed: true };
}

/**
 * Full Stop hook handler. Reads stdin payload, runs gate,
 * forks writer subprocess if warranted.
 */
export async function processWriteHook(payload: StopPayload): Promise<void> {
  const config = loadHookConfig();
  if (config.disabled) return;

  const startMs = Date.now();
  const knowledgeDir = await findKnowledgeDir(payload.cwd);

  // Get git diff
  let gitDiff = "";
  try {
    gitDiff = execSync("git diff HEAD", {
      cwd: payload.cwd,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  } catch {
    // no git or no diff
  }

  // Get transcript tail
  const tail = await parseTranscriptTail(payload.transcript_path);
  const hasWriteTools = hasToolCalls(tail.toolNames);

  const gate = await shouldProceed({
    stop_hook_active: payload.stop_hook_active,
    cwd: payload.cwd,
    hasGitDiff: gitDiff.length > 0,
    hasWriteToolCalls: hasWriteTools,
  });

  if (!gate.proceed) {
    if (knowledgeDir) {
      await appendHookLog(knowledgeDir, {
        ts: new Date().toISOString(),
        event: "hook-write",
        gate: "skip",
        reason: gate.reason,
        latency_ms: Date.now() - startMs,
      });
    }
    return;
  }

  // Fork the writer subprocess (fire-and-forget)
  const writerPayload: WriterPayload = {
    transcript_excerpt: tail.raw,
    git_diff: gitDiff,
    cwd: payload.cwd,
    knowledge_dir: knowledgeDir!,
  };

  const child = spawn(
    process.execPath,
    [
      "--import", "tsx",
      new URL("./writer-entry.js", import.meta.url).pathname,
      JSON.stringify(writerPayload),
      JSON.stringify(config),
    ],
    {
      detached: true,
      stdio: "ignore",
      cwd: payload.cwd,
      env: { ...process.env },
    },
  );
  child.unref();

  if (knowledgeDir) {
    await appendHookLog(knowledgeDir, {
      ts: new Date().toISOString(),
      event: "hook-write",
      gate: "proceed",
      latency_ms: Date.now() - startMs,
    });
  }
}
```

- [ ] **Step 4: Create the writer entry point for the subprocess**

Create `src/hooks/writer-entry.ts`:

```typescript
/**
 * Entry point for the detached kbase-writer subprocess.
 * Invoked by hook-write via spawn().
 *
 * Args: [writerPayload JSON, hookConfig JSON]
 */
import { runWriter } from "./writer.js";
import type { WriterPayload, HookConfig } from "./types.js";

async function main(): Promise<void> {
  const [, , payloadJson, configJson] = process.argv;

  if (!payloadJson || !configJson) {
    process.exit(1);
  }

  try {
    const payload: WriterPayload = JSON.parse(payloadJson);
    const config: HookConfig = JSON.parse(configJson);
    await runWriter(payload, config);
  } catch {
    // Fail silently — this is a background process
  }

  process.exit(0);
}

main();
```

- [ ] **Step 5: Create the CLI command wrapper**

Create `src/cli/commands/hook-write.ts`:

```typescript
import { Command } from "commander";
import { processWriteHook } from "../../hooks/hook-write.js";
import type { StopPayload } from "../../hooks/types.js";

export function register(program: Command): void {
  program
    .command("hook-write", { hidden: true })
    .description("(internal) Stop hook — dispatch kbase-writer if warranted")
    .action(async () => {
      try {
        const stdin = await readStdin();
        const payload: StopPayload = JSON.parse(stdin);
        await processWriteHook(payload);
      } catch {
        // Fail silently — never block the user's session
      }
    });
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
    if (process.stdin.readableEnded) resolve(data);
  });
}
```

- [ ] **Step 6: Register the command in CLI index**

In `src/cli/index.ts`, add the import:

```typescript
import { register as registerHookWrite } from "./commands/hook-write.js";
```

Add registration:

```typescript
registerHookWrite(program);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/hooks/hook-write.test.ts`
Expected: PASS — all 5 gate tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/hook-write.ts src/hooks/writer-entry.ts src/cli/commands/hook-write.ts src/cli/index.ts tests/hooks/hook-write.test.ts
git commit -m "feat: add kb hook-write command with pre-filter and writer subprocess"
```

---

## Task 9: CLI cleanup — remove `assumptions`, `history`, `explain`

**Files:**
- Delete: `src/cli/commands/assumptions.ts`
- Delete: `src/cli/commands/history.ts`
- Delete: `src/cli/commands/explain.ts`
- Modify: `src/cli/index.ts`
- Modify: `src/cli/commands/ask.ts`

- [ ] **Step 1: Read ask.ts and explain.ts to understand the `--json` mode**

Read `src/cli/commands/explain.ts` to understand what `--json` outputs. We need to fold its `--json` context-dump mode into `ask`.

- [ ] **Step 2: Remove command registrations from index.ts**

In `src/cli/index.ts`, remove the imports and `register*()` calls for:
- `registerAssumptions`
- `registerHistory`
- `registerExplain`

Keep all other registrations intact.

- [ ] **Step 3: Add `--json` flag to ask.ts**

In `src/cli/commands/ask.ts`, add a `--json` option that dumps the gathered context entries as JSON without calling the LLM. This absorbs `explain`'s `--json` mode.

After the existing `.option()` chains, add:

```typescript
.option("--json", "Dump gathered context as JSON without calling the LLM")
```

In the action handler, after context is gathered but before the LLM call, add:

```typescript
if (opts.json) {
  console.log(JSON.stringify(contextEntries, null, 2));
  return;
}
```

(The exact variable name for the gathered entries depends on the current `ask.ts` implementation — read the file to determine the correct insertion point.)

- [ ] **Step 4: Delete the removed command files**

```bash
rm src/cli/commands/assumptions.ts src/cli/commands/history.ts src/cli/commands/explain.ts
```

- [ ] **Step 5: Build and verify no import errors**

Run: `npm run build`
Expected: Clean compilation with no errors referencing deleted files.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove assumptions, history, explain commands; fold --json into ask"
```

---

## Task 10: Update `kb init` to wire hooks

**Files:**
- Modify: `src/cli/commands/init.ts`
- Create: `tests/cli/init-hooks.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/cli/init-hooks.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mergeHooksIntoSettings } from "../../src/cli/commands/init.js";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("mergeHooksIntoSettings", () => {
  let projectDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    projectDir = join(tmpdir(), `kbase-init-test-${Date.now()}`);
    await mkdir(join(projectDir, ".claude"), { recursive: true });
    settingsPath = join(projectDir, ".claude", "settings.json");
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it("adds hooks to an empty settings file", async () => {
    await writeFile(settingsPath, "{}");
    const added = await mergeHooksIntoSettings(settingsPath);
    expect(added).toBe(true);

    const settings = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.Stop).toHaveLength(1);
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toContain("kb hook-read");
    expect(settings.hooks.Stop[0].hooks[0].command).toContain("kb hook-write");
  });

  it("preserves existing hooks and adds kbase hooks", async () => {
    const existing = {
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: "command", command: "my-other-hook" }] },
        ],
      },
    };
    await writeFile(settingsPath, JSON.stringify(existing));
    await mergeHooksIntoSettings(settingsPath);

    const settings = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(settings.hooks.UserPromptSubmit).toHaveLength(2);
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe("my-other-hook");
    expect(settings.hooks.UserPromptSubmit[1].hooks[0].command).toContain("kb hook-read");
  });

  it("is idempotent — skips if kbase hooks already exist", async () => {
    await writeFile(settingsPath, "{}");
    await mergeHooksIntoSettings(settingsPath);
    await mergeHooksIntoSettings(settingsPath);

    const settings = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.Stop).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/init-hooks.test.ts`
Expected: FAIL — `mergeHooksIntoSettings` not exported.

- [ ] **Step 3: Add hook-wiring logic to init.ts**

Read `src/cli/commands/init.ts` first to understand the current implementation.

Add the following exports to `src/cli/commands/init.ts`:

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const KBASE_HOOK_READ = "kb hook-read";
const KBASE_HOOK_WRITE = "kb hook-write";

/**
 * Additively merge kbase hook entries into .claude/settings.json.
 * Returns true if hooks were added, false if already present.
 */
export async function mergeHooksIntoSettings(
  settingsPath: string,
): Promise<boolean> {
  const raw = await readFile(settingsPath, "utf-8");
  const settings = JSON.parse(raw);

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
  if (!settings.hooks.Stop) settings.hooks.Stop = [];

  // Check if kbase hooks already exist (idempotency)
  const hasReadHook = settings.hooks.UserPromptSubmit.some(
    (h: any) => h.hooks?.some((inner: any) => inner.command?.includes(KBASE_HOOK_READ)),
  );
  const hasWriteHook = settings.hooks.Stop.some(
    (h: any) => h.hooks?.some((inner: any) => inner.command?.includes(KBASE_HOOK_WRITE)),
  );

  if (hasReadHook && hasWriteHook) return false;

  if (!hasReadHook) {
    settings.hooks.UserPromptSubmit.push({
      hooks: [{ type: "command", command: KBASE_HOOK_READ }],
    });
  }

  if (!hasWriteHook) {
    settings.hooks.Stop.push({
      hooks: [{ type: "command", command: KBASE_HOOK_WRITE }],
    });
  }

  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  return true;
}
```

Then in the existing `init` command action handler, after the `.knowledge/` directory creation, add:

```typescript
if (!opts.noHooks) {
  const settingsPath = join(cwd, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    const added = await mergeHooksIntoSettings(settingsPath);
    if (added) {
      console.log("  Wired kbase hooks into .claude/settings.json");
    } else {
      console.log("  kbase hooks already present in .claude/settings.json");
    }
  } else {
    console.log("\n  No .claude/settings.json found.");
    console.log("  To enable kbase hooks, add to your .claude/settings.json:\n");
    console.log(JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: "command", command: KBASE_HOOK_READ }] }],
        Stop: [{ hooks: [{ type: "command", command: KBASE_HOOK_WRITE }] }],
      },
    }, null, 2));
  }
}
```

Add `--no-hooks` option to the command:

```typescript
.option("--no-hooks", "Skip Claude Code hook installation")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cli/init-hooks.test.ts`
Expected: PASS.

- [ ] **Step 5: Build full project**

Run: `npm run build`
Expected: Clean compilation.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/init.ts tests/cli/init-hooks.test.ts
git commit -m "feat: kb init auto-wires Claude Code hooks into settings.json"
```

---

## Task 11: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README**

Read `README.md` to see the full current contents.

- [ ] **Step 2: Update the 60-second setup section**

Replace the current setup block with:

```markdown
## 60-second setup

\`\`\`bash
# 1. Install
npm install -g kbase-mcp

# 2. In your project
cd your-project
kb init     # creates .knowledge/ and wires Claude Code hooks

# 3. Set your LLM API key (for smart commands and hook-based KB writes)
export ANTHROPIC_API_KEY=sk-ant-...

# 4. Done. Open Claude Code and start working.
#    kbase reads relevant entries into every prompt automatically
#    and records decisions after meaningful agent turns.
\`\`\`
```

- [ ] **Step 3: Update "What it does" section**

Replace the two-bullet description with:

```markdown
## What it does

kbase has three surfaces:

- **Hook-based automation** — two Claude Code hooks (`UserPromptSubmit`, `Stop`) inject relevant knowledge before each prompt and dispatch a dedicated writer subprocess after each meaningful turn. The primary agent never needs to know kbase exists.
- **An MCP server** (`kb-mcp`) for manual integration with coding agents that support MCP (Claude Code, Cursor). Agents call `read_knowledge`, `write_knowledge`, `query_deps`.
- **A CLI** (`kb`) for developers. Ask questions and get answers grounded in real decisions and real code.
```

- [ ] **Step 4: Update CLI section**

Remove `assumptions`, `history`, `explain` from the CLI command list. Add a note about `ask --json` absorbing `explain --json`.

- [ ] **Step 5: Demote MCP setup section**

Move the MCP setup (Claude Code `claude mcp add kbase`, Cursor, Agent instructions) to a "Manual integration" section below the hooks section. Add a note: "MCP setup is optional if you're using Claude Code hooks (the default after `kb init`)."

- [ ] **Step 6: Add a "How hooks work" section**

```markdown
## How hooks work

1. **Before each prompt** — the `UserPromptSubmit` hook runs `kb hook-read`. It extracts file/module references from your prompt, looks them up in the knowledge index, and injects matching entries as additional context. If no explicit references are found, a fast Haiku classifier identifies relevant modules.

2. **After each agent turn** — the `Stop` hook runs `kb hook-write`. A cheap pre-filter checks whether the turn produced any changes (git diff or write-class tool calls). If so, it forks a background Sonnet subprocess that reads the conversation excerpt and diff, decides whether a real decision was made, and records it via `write_knowledge`. Most turns produce no entry — that's expected.

Both hooks fail silently and never block your session.
```

- [ ] **Step 7: Add configuration section for hooks**

```markdown
## Hook configuration

| Variable | Default | Purpose |
|---|---|---|
| `KBASE_HOOKS_DISABLED` | unset | Set `1` to disable both hooks |
| `KBASE_WRITER_MODEL` | `claude-sonnet-4-5` | Override the writer subprocess model |
| `KBASE_MIN_DECISION_LEN` | `80` | Minimum character length for the `decision` field |
| `KBASE_HOOK_LOG` | `.knowledge/_cache/hook.log` | Override hook log path |
```

- [ ] **Step 8: Build to verify no issues**

Run: `npm run build`
Expected: Clean.

- [ ] **Step 9: Commit**

```bash
git add README.md
git commit -m "docs: update README for hook-based automation, remove dropped CLI commands"
```

---

## Task 12: Integration test — full round trip

Verify hooks work end-to-end with real (mocked) payloads.

**Files:**
- Create: `tests/hooks/integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `tests/hooks/integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { processReadHook } from "../../src/hooks/hook-read.js";
import { shouldProceed } from "../../src/hooks/hook-write.js";
import { writeEntry } from "../../src/core/store.js";
import { rebuildAll } from "../../src/core/index.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("hook round trip (no LLM)", () => {
  let projectDir: string;
  let knowledgeDir: string;

  beforeEach(async () => {
    projectDir = join(tmpdir(), `kbase-integration-${Date.now()}`);
    knowledgeDir = join(projectDir, ".knowledge");
    await mkdir(join(knowledgeDir, "_graph"), { recursive: true });
    await mkdir(join(knowledgeDir, "_cache"), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it("hook-read injects entries matching a file path in the prompt", async () => {
    await writeEntry(knowledgeDir, {
      module: "auth/session",
      summary: "JWT chosen for statelessness",
      decision: "We chose JWT for session tokens because they can be verified without a database lookup, which keeps the auth middleware stateless.",
      files: ["src/auth/session.ts"],
    });
    await rebuildAll(knowledgeDir);

    const result = await processReadHook({
      prompt: "There's a bug in src/auth/session.ts where the token expires too early",
      cwd: projectDir,
      apiKey: null,
    });

    expect(result).not.toBeNull();
    expect(result!.additionalContext).toContain("JWT");
    expect(result!.additionalContext).toContain("auth/session");
  });

  it("hook-read returns null for unrelated prompts", async () => {
    await writeEntry(knowledgeDir, {
      module: "auth/session",
      summary: "JWT chosen for statelessness",
      decision: "We chose JWT for session tokens because they can be verified without a database lookup.",
      files: ["src/auth/session.ts"],
    });
    await rebuildAll(knowledgeDir);

    const result = await processReadHook({
      prompt: "what's for lunch",
      cwd: projectDir,
      apiKey: null,
    });

    expect(result).toBeNull();
  });

  it("hook-write gate passes when git diff is present", async () => {
    const result = await shouldProceed({
      stop_hook_active: false,
      cwd: projectDir,
      hasGitDiff: true,
      hasWriteToolCalls: false,
    });
    expect(result.proceed).toBe(true);
  });

  it("hook-write gate blocks recursive invocations", async () => {
    const result = await shouldProceed({
      stop_hook_active: true,
      cwd: projectDir,
      hasGitDiff: true,
      hasWriteToolCalls: true,
    });
    expect(result.proceed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run tests/hooks/integration.test.ts`
Expected: PASS — all 4 tests pass.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass across all files.

- [ ] **Step 4: Final build check**

Run: `npm run build`
Expected: Clean compilation, no errors.

- [ ] **Step 5: Commit**

```bash
git add tests/hooks/integration.test.ts
git commit -m "test: add integration tests for hook round trip"
```

---

## Summary

| Task | What it produces | Estimated steps |
|---|---|---|
| 1 | Test infrastructure (vitest) | 5 |
| 2 | Hook types + logger | 6 |
| 3 | Transcript parser | 5 |
| 4 | Haiku classifier | 5 |
| 5 | `kb hook-read` command | 7 |
| 6 | Decision length validation | 5 |
| 7 | kbase-writer subprocess | 5 |
| 8 | `kb hook-write` command | 8 |
| 9 | CLI cleanup (remove 3 commands) | 7 |
| 10 | `kb init` hook wiring | 6 |
| 11 | README update | 9 |
| 12 | Integration test | 5 |
| **Total** | | **73 steps** |

Tasks 1–4 are foundational and must be sequential. Tasks 5–8 build on them (5 and 6–8 can run in parallel). Tasks 9–12 are independent of each other and can run in parallel after 5–8 are done.
