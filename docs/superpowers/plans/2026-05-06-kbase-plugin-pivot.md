# kbase Plugin Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repackage kbase as a Claude Code plugin (matching obra/superpowers' structure), removing the MCP server, npm distribution, `ANTHROPIC_API_KEY` requirement, writer subprocess, and Haiku classifier.

**Architecture:** Plugin contains three CC integration surfaces: (1) hook scripts that bootload skills and inject knowledge per-prompt deterministically, (2) skill markdown files describing behaviors the agent should adopt, (3) slash command markdown files for in-session LLM workflows. All LLM work runs inside the user's CC session via slash commands; no external API key is required. The TypeScript code shrinks to: storage primitives + UserPromptSubmit hook implementation. Stop hook, writer subprocess, MCP server, Anthropic SDK dependency, and the entire `kb` CLI are deleted.

**Tech Stack:** TypeScript (existing storage + read-hook implementation), Bash (hook wrappers), Claude Code plugin format (`.claude-plugin/plugin.json` + `hooks/hooks.json`), markdown skills + slash commands, vitest for tests.

---

## File Map

**Files to create:**

| Path | Responsibility |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest — name, version, author, description |
| `.claude-plugin/marketplace.json` | Marketplace registration listing kbase as an installable plugin |
| `hooks/hooks.json` | Registers `SessionStart` and `UserPromptSubmit` hooks |
| `hooks/run-hook.cmd` | Cross-platform (bash/cmd) wrapper that dispatches to a named hook script |
| `hooks/session-start` | Bash script: reads `skills/using-kbase/SKILL.md`, emits as `additionalContext` JSON |
| `hooks/user-prompt-submit` | Bash script: pipes stdin to `node dist/hooks/hook-read-entry.js`, forwards stdout |
| `skills/using-kbase/SKILL.md` | Meta-skill — replaces inline `SESSION_FRAMING` from `hook-session-start.ts` |
| `skills/consulting-knowledge/SKILL.md` | Behavior: how to use injected entries when modifying code |
| `skills/recording-decisions/SKILL.md` | Behavior: when to suggest `/kb-capture` and what makes a recordable decision |
| `skills/tracing-dependencies/SKILL.md` | Behavior: when to consult the dep graph before refactors |
| `commands/kb-ask.md` | Slash command: Q&A over the knowledge base |
| `commands/kb-impact.md` | Slash command: blast radius analysis for a file or module |
| `commands/kb-capture.md` | Slash command: record a decision from the recent turn |
| `commands/kb-init.md` | Slash command: set up `.knowledge/` in current project |
| `src/hooks/hook-read-entry.ts` | Thin entry: read stdin JSON, call `processReadHook`, write response JSON |

**Files to modify:**

| Path | Change |
|---|---|
| `src/hooks/hook-read.ts` | Drop classifier branch — only do explicit-path extraction |
| `src/hooks/classifier.ts` → `src/hooks/path-extractor.ts` | Rename, drop Anthropic SDK + classifyModules; keep `extractExplicitPaths` |
| `src/hooks/log.ts` | Drop `"hook-write"` from event union |
| `src/hooks/types.ts` | Drop `StopPayload`, `WriterPayload`, drop `writerModel`/`minDecisionLen` from `HookConfig` |
| `tests/hooks/hook-read.test.ts` | Drop classifier-related test assertions |
| `package.json` | Remove `bin`, remove `@modelcontextprotocol/sdk`, `@anthropic-ai/sdk`, `commander` |
| `.gitignore` | Remove `dist/` (we now commit built output) |
| `README.md` | Full rewrite for plugin-only install path |

**Files to delete:**

| Path | Reason |
|---|---|
| `src/mcp/` (entire dir) | MCP server retired |
| `src/hooks/writer.ts` | Writer subprocess retired |
| `src/hooks/writer-entry.ts` | Writer subprocess entry retired |
| `src/hooks/hook-write.ts` | Stop hook handler retired |
| `src/hooks/hook-session-start.ts` | Content moves to `skills/using-kbase/SKILL.md` |
| `src/cli/` (entire dir) | `kb` CLI binary retired |
| `tests/cli/` (entire dir) | CLI tests no longer relevant |
| `tests/hooks/writer.test.ts` | Tested deleted code |
| `tests/hooks/hook-write.test.ts` | Tested deleted code |
| `tests/hooks/hook-session-start.test.ts` | Tested deleted code |
| `tests/hooks/classifier.test.ts` | Tested deleted classifier branch |

---

## Task 1: Plugin manifest skeleton

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Create the plugin manifest**

```bash
mkdir -p .claude-plugin
```

`.claude-plugin/plugin.json`:

```json
{
  "name": "kbase",
  "description": "Knowledge layer for AI coding agents — captures and surfaces why code is the way it is",
  "version": "0.2.0",
  "author": {
    "name": "Pranay",
    "email": "pranay.yalaman@gmail.com"
  },
  "homepage": "https://github.com/pynay/kbase",
  "repository": "https://github.com/pynay/kbase",
  "license": "MIT",
  "keywords": ["knowledge-base", "claude-code", "comprehension", "decisions"]
}
```

- [ ] **Step 2: Create the marketplace manifest**

`.claude-plugin/marketplace.json`:

```json
{
  "name": "kbase-dev",
  "description": "Development marketplace for kbase",
  "owner": {
    "name": "Pranay",
    "email": "pranay.yalaman@gmail.com"
  },
  "plugins": [
    {
      "name": "kbase",
      "description": "Knowledge layer for AI coding agents",
      "version": "0.2.0",
      "source": "./",
      "author": {
        "name": "Pranay",
        "email": "pranay.yalaman@gmail.com"
      }
    }
  ]
}
```

- [ ] **Step 3: Validate the manifest**

Run: `claude plugin validate .`
Expected: no errors. If `claude plugin validate` is unavailable, skip — manifest is plain JSON, syntax-validated by JSON parsers.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/
git commit -m "feat: add CC plugin manifest skeleton"
```

---

## Task 2: SessionStart bootloader (hook + meta-skill)

**Files:**
- Create: `hooks/hooks.json`
- Create: `hooks/run-hook.cmd`
- Create: `hooks/session-start`
- Create: `skills/using-kbase/SKILL.md`

- [ ] **Step 1: Create the hooks registration**

```bash
mkdir -p hooks skills/using-kbase
```

`hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "async": false
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Create the cross-platform hook dispatcher**

`hooks/run-hook.cmd` (polyglot bash/cmd file):

```bash
#!/usr/bin/env bash
# This file works as both a bash script and a Windows .cmd file.
# Windows uses the @echo and goto lines; bash ignores them as comments-ish.
:<<"::CMDLITERAL"
@echo off
goto :CMDSTART
::CMDLITERAL

# --- bash section ---
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_NAME="$1"
shift
exec "${SCRIPT_DIR}/${HOOK_NAME}" "$@"

:CMDSTART
@rem Windows: invoke bash via WSL or git-bash; fall back to a friendly error.
where bash >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo kbase hooks require bash. Install Git Bash or WSL.
  exit /b 1
)
bash "%~dp0%1" %*
```

Then make it executable:

```bash
chmod +x hooks/run-hook.cmd
```

- [ ] **Step 3: Create the SessionStart bootloader script**

`hooks/session-start`:

```bash
#!/usr/bin/env bash
# SessionStart hook — reads using-kbase SKILL.md and emits as additionalContext.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Only fire if .knowledge/ exists in cwd or any ancestor.
dir="$(pwd)"
while [ "$dir" != "/" ]; do
  if [ -d "${dir}/.knowledge" ]; then
    break
  fi
  dir="$(dirname "$dir")"
done
if [ "$dir" = "/" ]; then
  exit 0
fi

# Read the meta-skill content.
content="$(cat "${PLUGIN_ROOT}/skills/using-kbase/SKILL.md" 2>/dev/null || echo "")"
if [ -z "$content" ]; then
  exit 0
fi

# Escape for JSON embedding.
escape_for_json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

escaped="$(escape_for_json "$content")"
printf '{"hookSpecificOutput":{"additionalContext":"%s"}}' "$escaped"
```

```bash
chmod +x hooks/session-start
```

- [ ] **Step 4: Create the meta-skill markdown**

`skills/using-kbase/SKILL.md`:

```markdown
---
name: using-kbase
description: Use when starting any session in a project with a .knowledge/ directory — establishes that injected entries are load-bearing and that decisions get recorded via /kb-capture
---

# Using kbase

This project uses kbase. Knowledge entries describing *why* code is the way
it is live in `.knowledge/<module>/<id>.md` files.

## What happens automatically

Before each of your turns, the kbase hook injects relevant entries into
your context under the heading **"Relevant kbase knowledge entries
(REQUIRED CONTEXT)"**. You will see them at the top of your input.

You **MUST** consult those entries before modifying the files they
describe. Treat them as load-bearing constraints, not background reading.
If your plan contradicts an entry, surface that explicitly to the user —
do not silently override.

## What does NOT happen automatically

There is **no** automatic write process. Decisions are recorded only when
the user invokes `/kb-capture` (or you suggest it). When you make a
non-obvious choice between alternatives — a decision a future reader would
miss — articulate the *why* in your response and suggest the user run
`/kb-capture` to record it.

## Available slash commands

- `/kb-init` — create `.knowledge/` in the current project
- `/kb-ask <question>` — natural-language Q&A over the knowledge base
- `/kb-impact <file>` — blast radius analysis for a file or module
- `/kb-capture` — record a decision from the recent turn

## Behavioral skills

When the situation matches their description, invoke these via the Skill tool:

- `consulting-knowledge` — how to act on injected entries
- `recording-decisions` — what makes a recordable decision
- `tracing-dependencies` — when to walk the dep graph before a refactor
```

- [ ] **Step 5: Manually test the bootloader**

Run:

```bash
mkdir -p /tmp/kb-test/.knowledge
cd /tmp/kb-test && /Users/pynay/Documents/kbase/kbase/hooks/session-start
```

Expected: a single line of JSON starting with `{"hookSpecificOutput":` and containing escaped SKILL.md content.

- [ ] **Step 6: Commit**

```bash
git add hooks/ skills/using-kbase/
git commit -m "feat: add SessionStart bootloader and using-kbase meta-skill"
```

---

## Task 3: UserPromptSubmit bootloader

**Files:**
- Create: `src/hooks/hook-read-entry.ts`
- Create: `hooks/user-prompt-submit`
- Modify: `hooks/hooks.json`

- [ ] **Step 1: Create the thin TS entry script**

`src/hooks/hook-read-entry.ts`:

```typescript
import { processReadHook } from "./hook-read.js";
import type { UserPromptSubmitPayload, HookContextResponse } from "./types.js";

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
    if (process.stdin.readableEnded) resolve(data);
  });
}

async function main(): Promise<void> {
  try {
    const stdin = await readStdin();
    const payload: UserPromptSubmitPayload = JSON.parse(stdin);
    const result = await processReadHook({
      prompt: payload.prompt,
      cwd: payload.cwd,
      apiKey: null, // classifier dropped — no API key path
    });
    if (result) {
      const response: HookContextResponse = {
        hookSpecificOutput: { additionalContext: result.additionalContext },
      };
      process.stdout.write(JSON.stringify(response));
    }
  } catch {
    // Fail silently — never block the user's prompt
  }
}

main();
```

- [ ] **Step 2: Create the bash wrapper**

`hooks/user-prompt-submit`:

```bash
#!/usr/bin/env bash
# UserPromptSubmit hook — pipes stdin to the node entry script.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

exec node "${PLUGIN_ROOT}/dist/hooks/hook-read-entry.js"
```

```bash
chmod +x hooks/user-prompt-submit
```

- [ ] **Step 3: Register UserPromptSubmit in hooks.json**

Modify `hooks/hooks.json` — add a `UserPromptSubmit` entry:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "async": false
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" user-prompt-submit",
            "async": false
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Build and verify the entry script exists**

Run: `npm run build`
Expected: clean build. Verify `dist/hooks/hook-read-entry.js` exists.

- [ ] **Step 5: Manually test the wrapper**

Run:

```bash
echo '{"session_id":"x","transcript_path":"/tmp/x","cwd":"/tmp/kb-test","prompt":"hello"}' | hooks/user-prompt-submit
```

Expected: empty output (no entries to inject in test dir) or a JSON `additionalContext` blob if entries exist.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/hook-read-entry.ts hooks/user-prompt-submit hooks/hooks.json
git commit -m "feat: add UserPromptSubmit bootloader and node entry"
```

---

## Task 4: Drop the Haiku classifier

**Files:**
- Rename: `src/hooks/classifier.ts` → `src/hooks/path-extractor.ts`
- Modify: `src/hooks/path-extractor.ts` (delete `classifyModules`)
- Modify: `src/hooks/hook-read.ts`
- Modify: `tests/hooks/hook-read.test.ts`
- Delete: `tests/hooks/classifier.test.ts`

- [ ] **Step 1: Delete the classifier test**

```bash
git rm tests/hooks/classifier.test.ts
```

- [ ] **Step 2: Rename and slim the classifier file**

```bash
git mv src/hooks/classifier.ts src/hooks/path-extractor.ts
```

Replace contents of `src/hooks/path-extractor.ts` with:

```typescript
/**
 * Extract explicit file paths and backtick-quoted symbols from a prompt.
 * Returns raw strings — caller is responsible for resolving against indexes.
 */
export function extractExplicitPaths(prompt: string): string[] {
  const results: string[] = [];

  const pathRegex = /(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(prompt)) !== null) {
    results.push(match[1]);
  }

  const backtickRegex = /`([^`]+)`/g;
  while ((match = backtickRegex.exec(prompt)) !== null) {
    results.push(match[1]);
  }

  return results;
}
```

- [ ] **Step 3: Update hook-read.ts to drop the classifier branch**

In `src/hooks/hook-read.ts`, change the import line:

```typescript
import { extractExplicitPaths } from "./path-extractor.js";
```

Then delete the entire Step-2-classifier block (the `if (entryIds.size < 2 && input.apiKey)` block and the `classifyModules` call) and the `let resolution = "path-extraction"` plus its mutation. Replace with:

```typescript
const resolution = "path-extraction";
```

The `apiKey` parameter remains in the input type for backward compat but is now unused inside the function body. Remove it from the `ReadHookInput` interface as well — it's no longer referenced.

Diff sketch (the change to hook-read.ts body):

```typescript
// Before:
let resolution = "path-extraction";
if (entryIds.size < 2 && input.apiKey) {
  const classifiedModules = await classifyModules(input.apiKey, input.prompt, moduleNames);
  for (const mod of classifiedModules) {
    if (moduleIndex[mod]) {
      for (const id of moduleIndex[mod]) entryIds.add(id);
    }
  }
  if (classifiedModules.length > 0) resolution = "classifier";
}

// After:
const resolution = "path-extraction";
```

And remove `apiKey: string | null;` from `ReadHookInput`.

- [ ] **Step 4: Update hook-read tests**

Modify `tests/hooks/hook-read.test.ts`:

- Remove all `apiKey` arguments from `processReadHook` calls (the parameter is gone).
- Remove any test assertions referencing the classifier path.

The remaining tests (path extraction, cap at 3 entries, imperative wording) all stay valid.

- [ ] **Step 5: Update hook-read-entry.ts**

The `apiKey: null` line in `src/hooks/hook-read-entry.ts` (created in Task 3) becomes invalid since `ReadHookInput` no longer has that field. Remove it:

```typescript
const result = await processReadHook({
  prompt: payload.prompt,
  cwd: payload.cwd,
});
```

- [ ] **Step 6: Run tests to verify**

Run: `npm test`
Expected: all remaining hook-read tests pass. Classifier-related tests no longer exist.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/path-extractor.ts src/hooks/hook-read.ts src/hooks/hook-read-entry.ts tests/hooks/hook-read.test.ts
git rm src/hooks/classifier.ts tests/hooks/classifier.test.ts 2>/dev/null || true
git commit -m "refactor: drop Haiku classifier, simplify hook-read to path extraction only"
```

---

## Task 5: Delete writer subprocess and Stop hook

**Files:**
- Delete: `src/hooks/writer.ts`, `src/hooks/writer-entry.ts`, `src/hooks/hook-write.ts`
- Delete: `src/cli/commands/hook-write.ts`
- Delete: `tests/hooks/writer.test.ts`, `tests/hooks/hook-write.test.ts`
- Modify: `src/hooks/log.ts`
- Modify: `src/hooks/types.ts`

- [ ] **Step 1: Delete the writer files**

```bash
git rm src/hooks/writer.ts src/hooks/writer-entry.ts src/hooks/hook-write.ts
git rm tests/hooks/writer.test.ts tests/hooks/hook-write.test.ts
```

- [ ] **Step 2: Delete the Stop hook CLI wrapper**

```bash
git rm src/cli/commands/hook-write.ts
```

(The rest of `src/cli/` will be deleted in Task 7 — leave the directory in place for now so this commit is focused.)

- [ ] **Step 3: Trim the log event union**

Modify `src/hooks/log.ts`:

```typescript
export interface HookLogEntry {
  ts: string;
  event: "hook-read" | "hook-session-start";
  gate: "proceed" | "skip";
  reason?: string;
  latency_ms?: number;
  entries_injected?: number;
  resolution?: string;
}
```

(Drop `entries_written`, `model`, `input_tokens`, `output_tokens` — only writer used those.)

- [ ] **Step 4: Trim the hooks types**

Modify `src/hooks/types.ts` — delete `StopPayload`, `WriterPayload`, and trim `HookConfig`:

```typescript
export interface UserPromptSubmitPayload {
  session_id: string;
  transcript_path: string;
  cwd: string;
  prompt: string;
}

export interface SessionStartPayload {
  session_id: string;
  transcript_path: string;
  cwd: string;
  source?: string;
}

export interface HookContextResponse {
  hookSpecificOutput: {
    additionalContext: string;
  };
}

export type UserPromptSubmitResponse = HookContextResponse;

export interface HookConfig {
  disabled: boolean;
  hookLogPath: string | null;
}

export function loadHookConfig(): HookConfig {
  return {
    disabled: process.env.KBASE_HOOKS_DISABLED === "1",
    hookLogPath: process.env.KBASE_HOOK_LOG ?? null,
  };
}
```

- [ ] **Step 5: Build and run tests**

Run: `npm run build && npm test`
Expected: clean build, all remaining tests pass. Test count drops as writer/hook-write tests are gone.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/log.ts src/hooks/types.ts
git commit -m "refactor: delete writer subprocess and Stop hook"
```

---

## Task 6: Delete MCP server

**Files:**
- Delete: `src/mcp/` (entire dir)
- Modify: `package.json`

- [ ] **Step 1: Delete the MCP server**

```bash
git rm -r src/mcp/
```

- [ ] **Step 2: Strip MCP and Anthropic deps from package.json**

Modify `package.json` — remove from `dependencies`:

- `@modelcontextprotocol/sdk`
- `@anthropic-ai/sdk`

Remove from `bin`:

- `kb-mcp`

(The `kb` bin entry will be removed in Task 7.)

Also remove these entries from `scripts`:

- `start:mcp` (no longer applicable)

After this, `package.json` `dependencies` should contain only what storage needs: `gray-matter`, `fast-glob`, `uuid`, plus `commander` if `kb` CLI still exists (deleted in Task 7).

- [ ] **Step 3: Reinstall to refresh node_modules**

Run: `rm -rf node_modules package-lock.json && npm install`
Expected: clean install, smaller dep tree.

- [ ] **Step 4: Build and test**

Run: `npm run build && npm test`
Expected: clean build, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "refactor: delete MCP server and Anthropic SDK dependency"
```

---

## Task 7: Delete the `kb` CLI entirely

**Files:**
- Delete: `src/cli/` (entire dir)
- Delete: `tests/cli/` (entire dir)
- Modify: `package.json`

- [ ] **Step 1: Delete the CLI source and tests**

```bash
git rm -r src/cli/ tests/cli/
```

- [ ] **Step 2: Strip remaining bin entries and CLI deps**

Modify `package.json`:

- Remove `bin` entirely (the only remaining entry was `kb`).
- Remove `commander` from `dependencies`.

After this, `bin` is gone, `dependencies` contains only `gray-matter`, `fast-glob`, `uuid`.

- [ ] **Step 3: Reinstall**

Run: `rm -rf node_modules package-lock.json && npm install`

- [ ] **Step 4: Build and test**

Run: `npm run build && npm test`
Expected: clean. Test count is now only hooks tests + core tests.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "refactor: delete kb CLI entirely — slash commands replace it"
```

---

## Task 8: Delete the obsolete SessionStart JS implementation

**Files:**
- Delete: `src/hooks/hook-session-start.ts`
- Delete: `tests/hooks/hook-session-start.test.ts`
- Delete: `src/hooks/transcript.ts` (was used only by writer)
- Delete: `tests/hooks/transcript.test.ts`

- [ ] **Step 1: Verify transcript.ts is unused**

Run:

```bash
grep -rn "from.*transcript" src/ tests/ 2>&1
```

Expected: only references inside `src/hooks/transcript.ts` itself or its test (both about to be deleted). If anything else references it, stop and reassess.

- [ ] **Step 2: Delete the files**

```bash
git rm src/hooks/hook-session-start.ts tests/hooks/hook-session-start.test.ts
git rm src/hooks/transcript.ts tests/hooks/transcript.test.ts
```

- [ ] **Step 3: Remove the SessionStart event from log union**

Modify `src/hooks/log.ts` — the `hook-session-start` event is now emitted by the bash bootloader, not JS. Drop it from the union:

```typescript
export interface HookLogEntry {
  ts: string;
  event: "hook-read";
  gate: "proceed" | "skip";
  reason?: string;
  latency_ms?: number;
  entries_injected?: number;
  resolution?: string;
}
```

(The bash session-start script could append to hook.log directly if logging is desired — left as a follow-up; not critical.)

- [ ] **Step 4: Build and test**

Run: `npm run build && npm test`
Expected: clean. Tests are now: hook-read, log, integration (if it survived), store-validation.

- [ ] **Step 5: Verify integration test still works**

If `tests/hooks/integration.test.ts` references writer or hook-session-start, fix it now or delete it. Inspect:

Run: `cat tests/hooks/integration.test.ts | head -30`

If it tests the full read+write round-trip via the writer, it's no longer applicable — delete it. If it tests only the read injection, keep it.

```bash
# If the integration test must go:
git rm tests/hooks/integration.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/log.ts
git commit -m "refactor: delete JS SessionStart hook (content moved to using-kbase skill)"
```

---

## Task 9: Behavioral skills

**Files:**
- Create: `skills/consulting-knowledge/SKILL.md`
- Create: `skills/recording-decisions/SKILL.md`
- Create: `skills/tracing-dependencies/SKILL.md`

- [ ] **Step 1: Create the consulting-knowledge skill**

```bash
mkdir -p skills/consulting-knowledge
```

`skills/consulting-knowledge/SKILL.md`:

```markdown
---
name: consulting-knowledge
description: Use when about to read, modify, analyze, or refactor any source file in a project that has a .knowledge/ directory — ensures injected entries are honored
---

# Consulting Knowledge

## When to use

You're about to work with a source file in a project that has `.knowledge/`.
This skill ensures you use any injected knowledge entries correctly.

## What to do

1. **Look for injected entries.** Scan your context for the heading
   `## Relevant kbase knowledge entries (REQUIRED CONTEXT)`. Read every
   entry under it before touching the file.

2. **If no entries were injected for this file**, the regex extractor
   didn't match a path. This does not mean no entries exist. If the file
   you're about to modify is significant, glob `.knowledge/**/*.md` for
   entries that mention it:

   ```bash
   grep -l "<file-path>" .knowledge/**/*.md
   ```

3. **Honor entries as constraints.** Decisions, alternatives, assumptions,
   and risks listed in an entry describe load-bearing context for that
   file. If your plan contradicts an entry, surface that explicitly to
   the user **before** making the change. Frame it as: "entry X says Y,
   but you're asking me to do Z — should I supersede the entry?"

4. **Don't silently override.** Even if you think you know better, give
   the user the chance to confirm or update the entry first.

## What does not count

- Style/formatting changes don't need entry consultation.
- Pure renames where semantics are unchanged don't need consultation.
- Test-only edits typically don't need consultation unless the testing
  strategy itself is documented in an entry.
```

- [ ] **Step 2: Create the recording-decisions skill**

```bash
mkdir -p skills/recording-decisions
```

`skills/recording-decisions/SKILL.md`:

```markdown
---
name: recording-decisions
description: Use when you have just made a non-obvious choice between alternatives, introduced a load-bearing assumption, or made a change a future reader might not understand — prompts the user to record it via /kb-capture
---

# Recording Decisions

## When to use

You just produced a turn that contains:
- A non-obvious choice between alternatives, with reasoning the user wouldn't infer from the diff
- A load-bearing assumption (e.g., "this only works because X is always true")
- A constraint or risk introduced or relied on by the change
- A dependency that's load-bearing but not visible from imports

If any of those apply, this skill fires.

## What to do

1. **Articulate the why in your response.** The diff shows the *what*; you
   supply the *why*. Two to five sentences. Be specific about the
   alternatives you considered and why you chose this one.

2. **Suggest the user invoke `/kb-capture`.** Don't run it for them — it's
   their call whether the decision is worth recording. Phrase it like:

   > This change introduced an assumption that <X>. If you want to record
   > it, run `/kb-capture` and I'll write a knowledge entry.

3. **Don't suggest /kb-capture for non-decisions.** Restating what the
   diff shows, formatting changes, pure renames, test additions without a
   novel testing strategy — none of these warrant a knowledge entry.
   Returning *no* suggestion is the right answer most of the time.
```

- [ ] **Step 3: Create the tracing-dependencies skill**

```bash
mkdir -p skills/tracing-dependencies
```

`skills/tracing-dependencies/SKILL.md`:

```markdown
---
name: tracing-dependencies
description: Use when about to refactor across multiple modules, rename a public API, or change a load-bearing interface — surfaces blast radius before changes
---

# Tracing Dependencies

## When to use

You're about to:
- Refactor a module that other modules depend on
- Rename or change the signature of a public function/type
- Change a load-bearing interface, file format, or protocol

## What to do

1. **Read the dep graph.** kbase maintains
   `.knowledge/_graph/dependencies.json` mapping
   `module → { depends_on, depended_on_by }`. Read it directly:

   ```bash
   cat .knowledge/_graph/dependencies.json
   ```

2. **Identify the blast radius.** Walk `depended_on_by` for the module
   you're changing. Every module in that list has code that may break.

3. **Pull entries for affected modules.** For each module in the blast
   radius, read its entries. Look for assumptions and risks that
   constrain your change.

4. **Surface the radius before changing.** Before producing the diff,
   tell the user: "This change affects N modules: [list]. The most
   load-bearing constraint I see is [from entry X]. Proceed?"

5. **If the user proceeds and the change introduces a new constraint,
   invoke `recording-decisions`** to suggest `/kb-capture`.
```

- [ ] **Step 4: Commit**

```bash
git add skills/
git commit -m "feat: add behavioral skills (consulting-knowledge, recording-decisions, tracing-dependencies)"
```

---

## Task 10: Slash commands

**Files:**
- Create: `commands/kb-init.md`
- Create: `commands/kb-ask.md`
- Create: `commands/kb-impact.md`
- Create: `commands/kb-capture.md`

- [ ] **Step 1: Create /kb-init**

```bash
mkdir -p commands
```

`commands/kb-init.md`:

```markdown
---
description: Initialize kbase in the current project — creates .knowledge/ and gitignore entries
---

You are setting up kbase in the user's current project.

Steps:

1. Use the `Bash` tool to check whether `.knowledge/` already exists:
   ```bash
   ls -d .knowledge 2>/dev/null && echo EXISTS || echo MISSING
   ```

2. If MISSING, create the directory tree:
   ```bash
   mkdir -p .knowledge/_graph .knowledge/_cache
   ```

3. Write a placeholder `.knowledge/index.md` using the `Write` tool:
   ```markdown
   # Knowledge Base Index

   > No entries yet. Entries are added via `/kb-capture` after meaningful
   > decisions. The dep graph and this file regenerate as entries grow.
   ```

4. Add `.knowledge/_cache/`, `.knowledge/_graph/`, and `.knowledge/index.md`
   to `.gitignore` (append if missing). Use `Read` to inspect existing
   `.gitignore`, then `Write` (or `Edit`) to add missing lines.

5. Confirm to the user:
   > kbase initialized in this project. The kbase plugin's hooks will
   > start injecting any future knowledge entries into your prompts
   > automatically. Use `/kb-capture` to record decisions.
```

- [ ] **Step 2: Create /kb-ask**

`commands/kb-ask.md`:

```markdown
---
description: Natural-language Q&A over the project's knowledge base. Usage — /kb-ask <question>
---

The user is asking a question about decisions or context recorded in this
project's `.knowledge/` directory.

User's question: $ARGUMENTS

Steps:

1. Use `Glob` to find all knowledge entries:
   ```
   .knowledge/**/*.md
   ```
   Exclude `.knowledge/_graph/` and `.knowledge/index.md` from the results.

2. Use `Read` to load every matching entry. Each is markdown with YAML
   frontmatter (`module`, `summary`, `files`, `depends_on`, etc.) followed
   by `## Decision` / `## Alternatives` / `## Assumptions` / `## Risk`
   sections.

3. Identify the entries that are relevant to the user's question.
   Relevance signals: matching keywords in `summary`/`decision`,
   matching file paths in `files`, matching module names.

4. Synthesize an answer from the relevant entries. Cite which entries
   you used by their `id` (the filename minus `.md`).

5. If no entries are relevant, say so directly. Do not fabricate. Suggest
   the user check whether the topic has been recorded yet.

Format your answer as:

> **Answer:** <synthesized answer in 1-3 paragraphs>
>
> **Sources:** entry-id-1, entry-id-2, ...
```

- [ ] **Step 3: Create /kb-impact**

`commands/kb-impact.md`:

```markdown
---
description: Blast radius analysis for a file or module — what could break, what to test. Usage — /kb-impact <file-or-module>
---

The user wants to know what could break if they change a specific file or
module.

Target: $ARGUMENTS

Steps:

1. Use `Read` to load `.knowledge/_graph/dependencies.json`. It maps
   `module → { depends_on: [...], depended_on_by: [...] }`.

2. Use `Read` to load `.knowledge/_graph/files.json` (file path → entry
   ids) so you can find entries about the target.

3. Determine the blast radius:
   - If the target is a file path, look it up in `files.json` to find
     the owning module(s), then walk `depended_on_by` from there.
   - If the target is a module name, walk `depended_on_by` directly.

4. For each module in the radius, find its entries via the module index
   (`Read .knowledge/_graph/modules.json`) and load the entries with
   `Glob` + `Read`.

5. Synthesize a blast-radius report:

> **Affected modules:** module-a, module-b, ...
>
> **What could break:**
> - <one bullet per real risk drawn from the entries' `risk` and
>   `assumptions` fields>
>
> **What to test:**
> - <concrete tests/checks suggested by the entries>
>
> **Sources:** entry-id-1, entry-id-2, ...

If no entries exist for the affected modules, report that the blast
radius is unknown — the user should record entries for these modules
before assuming the change is safe.
```

- [ ] **Step 4: Create /kb-capture**

`commands/kb-capture.md`:

```markdown
---
description: Record a knowledge entry from the most recent meaningful turn. Usage — /kb-capture
---

The user wants to capture a knowledge entry from their recent work.

Steps:

1. Use `Bash` to inspect the recent diff:
   ```bash
   git diff HEAD --stat && git diff HEAD
   ```

2. Use `Read` to inspect the recent transcript turns. The transcript
   path is provided by Claude Code as a session-level path; if you
   don't have it, ask the user to paste a brief summary of what they
   just decided.

3. **Decide whether a recordable decision was made.** Use the
   `recording-decisions` skill's criteria:
   - Non-obvious choice between alternatives, with reasoning
   - Load-bearing assumption a future reader would miss
   - Constraint or risk the change introduces
   - Load-bearing dependency not visible from imports

   **Returning nothing is the correct answer most of the time.** If
   nothing in the diff or recent turns rises to the bar, tell the user:

   > No recordable decision detected in the recent turn. The diff
   > looks like <summary>. If you disagree, describe the decision and
   > I'll record it.

4. **If a decision was made**, ask the user to confirm the module and
   summary before writing:

   > I'll record this as:
   > - module: <smallest accurate scope>
   > - summary: <one sentence>
   > - decision: <2-5 sentence why>
   > - files: <paths from the diff>
   >
   > OK to record? (You can edit any field.)

5. **After confirmation**, write the entry. The entry path is
   `.knowledge/<module>/<uuid>.md` where `<uuid>` is a UUID v4 you
   generate. The format is YAML frontmatter + body. Use the `Write` tool.

   Example:

   ```markdown
   ---
   id: <uuid>
   module: auth/session
   summary: Session tokens use JWT
   timestamp: 2026-05-06T15:00:00Z
   agent: kb-capture
   files:
     - src/auth/session.ts
   ---

   ## Decision

   We chose JWT for session tokens because they are stateless and
   verifiable without a database lookup. <continue with at least 80
   characters of detail>

   ## Alternatives

   - Server-side sessions with Redis
   - Opaque tokens with a token table
   ```

6. After writing, regenerate the dep graph by globbing all entries and
   rebuilding `.knowledge/_graph/*.json`. (Or skip this step if a `kb
   reindex` equivalent slash command exists — for now, keep it inline.)

7. Confirm to the user:

   > Recorded entry <uuid> under module <module>.
```

- [ ] **Step 5: Commit**

```bash
git add commands/
git commit -m "feat: add slash commands (kb-init, kb-ask, kb-impact, kb-capture)"
```

---

## Task 11: Commit dist/ and update gitignore

**Files:**
- Modify: `.gitignore`
- Add: `dist/` (committed)

- [ ] **Step 1: Remove dist/ from .gitignore**

Edit `.gitignore` — remove the `dist/` line and add the derived knowledge files (which kbase regenerates on read paths and shouldn't be committed). Final `.gitignore`:

```
node_modules/
.knowledge/_cache/
.knowledge/_graph/
.knowledge/index.md
*.tsbuildinfo
```

- [ ] **Step 2: Build and stage dist/**

Run: `npm run build`
Then:

```bash
git add dist/ .gitignore
```

- [ ] **Step 3: Verify dist/ contains the right files**

Run: `ls dist/hooks/hook-read-entry.js dist/hooks/hook-read.js dist/core/store.js`
Expected: all three exist.

- [ ] **Step 4: Commit**

```bash
git commit -m "build: commit dist/ for plugin distribution"
```

---

## Task 12: Rewrite README for plugin install

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README content**

Rewrite `README.md`:

```markdown
# kbase

A Claude Code plugin that captures *why* code is the way it is — decisions,
assumptions, dependencies, risks — and surfaces that knowledge to coding
agents automatically.

Knowledge lives as structured markdown files in a `.knowledge/` directory,
versioned with git. No database, no vector store, no cloud, no API key.

## Install

```bash
# Add the kbase marketplace
claude plugin marketplace add https://github.com/pynay/kbase

# Install kbase
claude plugin install kbase
```

In any project where you want kbase active, open Claude Code and run:

```
/kb-init
```

That's the entire setup.

## What it does

When you're working in a project that has a `.knowledge/` directory, kbase
automatically:

1. **At session start** — injects a framing message telling the agent kbase
   is active and how to use injected entries.
2. **Before each prompt** — extracts file paths from your prompt, looks
   them up in the knowledge index, and injects matching entries as
   `REQUIRED CONTEXT` for the agent to consult.

You manually capture decisions when you want them recorded:

3. **`/kb-capture`** — records a knowledge entry from the most recent
   turn. The agent inspects the diff and conversation, decides whether a
   recordable decision was made, and writes an entry only if so.

## Slash commands

- `/kb-init` — set up `.knowledge/` in the current project
- `/kb-ask <question>` — natural-language Q&A over recorded knowledge
- `/kb-impact <file>` — blast radius analysis for a file or module
- `/kb-capture` — record a decision from the recent turn

## Behavioral skills

The plugin ships skills the agent invokes when their description matches:

- `using-kbase` — meta-skill, injected at session start
- `consulting-knowledge` — how to act on injected entries when modifying code
- `recording-decisions` — when to suggest `/kb-capture`
- `tracing-dependencies` — when to walk the dep graph before refactors

## Data layout

```
.knowledge/
├── auth/
│   └── <uuid>.md         # one file per decision (committed)
├── _graph/               # derived indexes (gitignored, regenerated)
└── _cache/               # per-developer cache (gitignored)
```

## Configuration

Two environment variables, both optional:

| Var | Default | Purpose |
|---|---|---|
| `KBASE_HOOKS_DISABLED` | unset | Set `1` to disable kbase hooks for this session |
| `KBASE_HOOK_LOG` | `.knowledge/_cache/hook.log` | Override hook event log path |

No API key required. All LLM work runs inside your CC session.

## License

MIT.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for plugin-only install path"
```

---

## Task 13: Local install verification

**Files:**
- (verification only — no files changed)

- [ ] **Step 1: Validate the plugin manifest**

Run: `claude plugin validate .`
Expected: no errors. If the command isn't found, run `claude plugin --help` to confirm the right subcommand.

- [ ] **Step 2: Add the local repo as a marketplace**

Run:

```bash
claude plugin marketplace add /Users/pynay/Documents/kbase/kbase
```

Expected: marketplace registered.

- [ ] **Step 3: Install the plugin**

Run:

```bash
claude plugin install kbase@kbase-dev
```

Expected: plugin installed under `~/.claude/plugins/cache/kbase-dev/kbase/0.2.0/`.

- [ ] **Step 4: Test in a fresh project**

```bash
mkdir -p /tmp/kbase-test && cd /tmp/kbase-test && git init
```

Open Claude Code in `/tmp/kbase-test`. In the session:
1. Run `/kb-init`. Verify `.knowledge/` is created with `_graph/` and `_cache/`.
2. Add a fake entry by running `/kb-capture` after editing a file.
3. Run `/kb-ask "what decisions have we recorded?"`.
4. Verify the SessionStart frame appears in context (visible in the
   transcript jsonl at `~/.claude/projects/<slug>/transcript.jsonl`).
5. Type a prompt mentioning a file with a knowledge entry. Verify
   `## Relevant kbase knowledge entries (REQUIRED CONTEXT)` appears in
   the model's input.

- [ ] **Step 5: If any verification step fails**

Stop. Diagnose the specific failure. Add a debug step or fix to the plan
inline. Don't proceed to Task 14 until all five verification steps pass.

---

## Task 14: Final cleanup and PR

**Files:**
- (final checks and commit)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass (test count is now reduced; should be roughly 15-20 tests across hooks + core).

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Stage `dist/` updates**

If the build output drifted during late tasks:

```bash
git add dist/
git commit -m "build: refresh dist/" || echo "dist already up to date"
```

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/plugin-pivot
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --base main --head feat/plugin-pivot --title "feat: repackage kbase as a Claude Code plugin" --body "$(cat <<'EOF'
## Summary

Repackages kbase as a Claude Code plugin matching the obra/superpowers
structure. Drops the MCP server, npm distribution, ANTHROPIC_API_KEY
requirement, writer subprocess, Haiku classifier, and the entire kb CLI.

The plugin ships:
- Two deterministic hooks (SessionStart bootloader, UserPromptSubmit read injection)
- Four behavioral skills (using-kbase, consulting-knowledge, recording-decisions, tracing-dependencies)
- Four slash commands (/kb-init, /kb-ask, /kb-impact, /kb-capture)

All LLM work runs inside the user's CC session. No external API key.

Builds on #7 (deterministic-hooks). Recommend merging #7 first; this PR
will rebase cleanly afterward.

## Test plan

- [x] npm test passes
- [x] npm run build clean
- [x] claude plugin validate .
- [x] Fresh-project install: /kb-init, /kb-capture, /kb-ask all work
- [x] SessionStart framing appears in session context
- [x] UserPromptSubmit injection appears for prompts with explicit paths
EOF
)"
```

- [ ] **Step 6: Verify the PR opened**

Read the URL the previous command output. Open it. Confirm the diff matches expectations (large deletions of MCP/CLI/writer, additions of plugin scaffold).

---

## Summary

| Task | What it produces | Estimated steps |
|---|---|---|
| 1 | Plugin manifest skeleton | 4 |
| 2 | SessionStart bootloader + meta-skill | 6 |
| 3 | UserPromptSubmit bootloader | 6 |
| 4 | Drop classifier | 8 |
| 5 | Delete writer subprocess | 6 |
| 6 | Delete MCP server | 5 |
| 7 | Delete kb CLI | 5 |
| 8 | Delete obsolete SessionStart JS | 6 |
| 9 | Behavioral skills | 4 |
| 10 | Slash commands | 5 |
| 11 | Commit dist/ | 4 |
| 12 | README rewrite | 2 |
| 13 | Install verification | 5 |
| 14 | PR | 6 |
| **Total** | | **~72 steps** |

Tasks 1–3 establish the plugin scaffold. Tasks 4–8 are aggressive
deletions. Tasks 9–10 are markdown content. Tasks 11–14 are integration
and shipping.

Tasks 1–3 must be sequential (later tasks depend on the plugin scaffold).
Tasks 4–8 can be done in any order after 3. Tasks 9–10 are independent of
4–8. Tasks 11–14 are sequential at the end.
