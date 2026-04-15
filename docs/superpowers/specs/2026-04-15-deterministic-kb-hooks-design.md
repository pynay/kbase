# Deterministic kbase via Claude Code Hooks

**Status:** Draft
**Date:** 2026-04-15
**Author:** pranay (with Claude)

## Problem

kbase today depends on the primary coding agent reliably calling MCP tools
(`read_knowledge` before touching code, `write_knowledge` after non-trivial
changes). In practice this discipline degrades: agents skip the calls, call
them at the wrong granularity, or invoke them inconsistently across sessions.
The result is a knowledge base that's less complete and less trusted than it
should be, and a CLAUDE.md instructions block that has to keep escalating its
language ("required, not optional") to compensate.

The root cause is architectural: kbase asks the LLM to remember a procedure
during work that's already cognitively loaded. We should remove the choice
from the LLM entirely.

## Goal

Make kbase reads and writes deterministic by moving them out of the primary
agent's tool-call discipline and into Claude Code's hook system. The primary
agent does not need to know kbase exists. The harness reads relevant entries
into context before each prompt and dispatches a dedicated writer subagent
after each turn.

This is inspired by GSD-2's pattern of harness-controlled context injection
and post-unit state writes (see `auto-post-unit.ts`, "Tiered Context
Injection"). GSD validates the direction: don't make the LLM responsible for
the discipline; make the harness do it.

## Non-goals

- Portability to other coding-agent harnesses (Cursor, Codex, Aider). Build
  for Claude Code first; revisit if there's demand.
- Replacing the MCP server. It stays as the documented manual integration
  path and as the in-process API the writer subagent calls.
- A queryable activity log or "session replay" feature beyond the basic
  hook log used for debugging.
- Migration tooling. Project is `0.1.0-beta` with no installed user base.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code session (primary agent — codes, doesn't know   │
│  kbase exists; no CLAUDE.md instructions required)          │
└─────────────────────────────────────────────────────────────┘
         ▲                                          │
         │ injects additionalContext                │ Stop event
         │                                          ▼
┌────────────────────┐                  ┌──────────────────────┐
│ UserPromptSubmit   │                  │ Stop hook            │
│ hook (command)     │                  │ (command)            │
│  └─ kb hook-read   │                  │  └─ kb hook-write    │
│      ├─ gate       │                  │      ├─ gate         │
│      ├─ regex      │                  │      └─ fork writer  │
│      └─ Haiku      │                  │         (detached)   │
│         classifier │                  └──────────────────────┘
└────────────────────┘                              │
                                                    ▼
                                        ┌──────────────────────┐
                                        │ kbase-writer         │
                                        │ subprocess (Sonnet)  │
                                        │  ├─ read_knowledge   │
                                        │  │   (dedupe gate)   │
                                        │  └─ write_knowledge  │
                                        │     (or no-op)       │
                                        └──────────────────────┘
                                                    │
                                                    ▼
                                          .knowledge/ (markdown)
```

Three components, all Claude-Code-native:

1. **`kb hook-read`** — invoked by `UserPromptSubmit` hook. Cheap pre-filter
   (regex path/symbol extraction against the existing `_graph/files.json`
   index), Haiku classifier as fallback when no explicit references hit.
   Outputs entries as `additionalContext` for injection into the prompt.

2. **`kb hook-write`** — invoked by `Stop` hook. Cheap deterministic gate
   (skip pure Q&A turns, skip when `.knowledge/` is empty). When the gate
   opens, forks a detached writer subprocess so the primary agent's Stop
   is never blocked. Hook returns immediately.

3. **kbase-writer subprocess** — Sonnet-class Anthropic SDK call with a
   narrow tool surface (`read_knowledge`, `write_knowledge` only, called
   in-process). System prompt enforces "empty output is the correct answer
   most of the time," dedupe-before-write, and quality bar.

The MCP server (`kb-mcp`) stays. It becomes optional for the primary agent
and remains the documented way for the writer subprocess to interact with
the knowledge base (though in this design we call the same internal
functions directly via SDK to avoid an extra hop).

## Why hooks (vs. alternatives considered)

Two alternatives were ruled out during design:

- **Pure agent hooks (`type: "agent"`).** Claude Code supports these and
  they would eliminate our hidden CLI commands, but they fire on every
  matching event with no gating mechanism. Pure Q&A turns ("what does this
  function do?") would still pay for a subagent dispatch. We want a cheap
  deterministic gate, which only exists at the command-hook level.

- **Hybrid (command pre-filter + agent hook chained).** Verified against
  the official hooks docs: hooks on the same event run in parallel with
  no documented suppression mechanism. This pattern doesn't work.

Path A (one command hook per event, conditional SDK call inside) is the
only design that achieves zero-LLM-cost on uneventful turns while keeping
the kbase surface small. Cost shape per turn:
- Pure Q&A: 0 LLM calls
- Edit-producing turn: 1 LLM call (the writer)
- Prompt with explicit path mention: 0 LLM calls (regex resolution)
- Prompt with implicit module reference: 1 Haiku call (classifier)

## Components

### `kb hook-read`

**Hook config** (`.claude/settings.json`):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "kb hook-read" }] }
    ]
  }
}
```

**Stdin payload** (from Claude Code):

```json
{
  "session_id": "...",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "prompt": "fix the login redirect bug"
}
```

**Flow:**

1. Parse stdin JSON.
2. **Gate:** if `.knowledge/` missing or `_graph/modules.json` empty, exit 0
   with empty stdout.
3. **Cheap path/symbol extraction:** regex over `prompt` for file paths and
   backtick-quoted symbols. Resolve hits via existing `_graph/files.json`.
4. **Classifier (only if step 3 yielded zero or low-confidence hits):** call
   Haiku with `prompt + .knowledge/index.md` (the auto-generated module
   list). Haiku returns a JSON array of module names judged relevant, or
   `[]`. Resolve via `_graph/modules.json`.
5. Cap at 3 entries / ~2k tokens to avoid context bloat.
6. Emit Claude Code's `UserPromptSubmit` response shape:
   `{"hookSpecificOutput": {"additionalContext": "<rendered entries>"}}`.
7. **Failure:** any error → log to stderr + hook log, exit 0 with empty
   stdout. Never block the user's prompt.

### `kb hook-write`

**Hook config:**

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "kb hook-write" }] }
    ]
  }
}
```

**Stdin payload:**

```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "...",
  "stop_hook_active": false
}
```

**Flow:**

1. Parse stdin JSON.
2. **Gate (all must be true to proceed):**
   - `stop_hook_active` is false (avoid recursion)
   - `.knowledge/` exists
   - Either `git diff HEAD` is non-empty, or the last assistant turn in
     the transcript contains ≥1 `Edit`/`Write`/`Bash` tool call.
3. Read transcript tail (last user turn through last assistant turn) and
   `git diff HEAD`.
4. **Fork the kbase-writer subprocess detached** (`spawn` with
   `detached: true`, `stdio: 'ignore'`, `unref()`). Hook returns
   immediately so the user's session is never held up.
5. Hook itself exits 0 regardless of subprocess outcome.

### kbase-writer subprocess

Not a Claude Code subagent file — a standalone Anthropic SDK call from
inside the detached subprocess.

**Model:** `claude-sonnet-4-5` default. Override via `KBASE_WRITER_MODEL`.

**Tool surface (defined inline in the SDK call):**

- `read_knowledge(target, depth?)` — wraps the existing in-process
  function. No MCP hop.
- `write_knowledge(entry)` — same. Validates against existing schema.

No file system, no shell, no web. The diff and transcript are already in
the prompt; the subagent has no reason to reach further.

**System prompt (canonical text):**

```
You are the kbase-writer. Your only job is to record decisions worth
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
entry that supersedes it (set `supersedes: <old-id>` in frontmatter).

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
- `module`: the smallest accurate scope (e.g. `auth/session`, not `auth`)
- `summary`: one sentence, the headline
- `decision`: the why, in 2-5 sentences. The diff is the what; you supply the why.
- `files`: paths actually touched
- `alternatives`, `assumptions`, `risk`, `affects`, `depends_on`, `tags`:
  fill in only when you genuinely know them from the conversation.
  Empty is better than fabricated.
```

**Quality bar (defense in depth):**

1. **Prompt-level:** the rules above, with explicit "empty is correct."
2. **Schema-level:** existing `write_knowledge` validation, plus a new
   minimum-length check on `decision` (default 80 chars, configurable via
   `KBASE_MIN_DECISION_LEN`). Sub-floor entries are rejected with a tool
   error so the subagent can retry or skip.
3. **Post-write dedupe sweep:** *not shipped initially.* Reconsider only
   if `hook.log` shows duplicate sprawl in real use.

**Failure modes:**

- Subagent hangs: 90s SDK timeout, hard kill, log to `hook.log`.
- Malformed entry: schema rejects, error returned to subagent, retry
  cap of 2 per entry.
- Subagent writes nothing: log "no decision found," exit 0. Normal.
- API error / no API key: log, exit 0. Fail silent — never break the
  user's session.

## CLI surface cleanup

This redesign is bundled with a CLI cleanup: removing three commands that
are now subsumed by `ask` and adding two hidden hook commands.

| Command | Status | Reason |
|---|---|---|
| `init` | keep | Essential bootstrap. |
| `reindex` | keep | Required after manual edits. |
| `search` | keep | Fast, deterministic, no API key. |
| `stale` | keep | Quality gate; no good replacement. |
| `deps` | keep | Mechanical graph walk, distinct from `ask`. |
| `impact` | keep | Specialized blast-radius logic. |
| `ask` | keep | Headline smart command. |
| `assumptions` | **remove** | Niche frontmatter slicing; `kb ask` covers it. |
| `history` | **remove** | `git log .knowledge/<module>/` covers it. |
| `explain` | **remove** | Subsumed by `kb ask "explain <file>"`. Fold the `--json` context-dump mode into `ask --json`. |
| `hook-read` | **add (hidden)** | UserPromptSubmit hook entry point. |
| `hook-write` | **add (hidden)** | Stop hook entry point. |

Final shipped surface: 7 user-facing commands, 2 hidden hook commands.
Hidden commands are omitted from `--help` output but remain documented in
the spec for maintainers.

## `kb init` — updated behavior

Currently `kb init` creates `.knowledge/` and the index. New behavior adds
hook installation:

1. Detect if `.claude/settings.json` exists in cwd.
2. If yes: parse JSON, additively merge our two hook entries (do not
   replace existing hooks). Idempotent — detect by command string and
   skip if already present. Print exactly what was added.
3. If no: print the JSON snippet for the user to add manually. Do not
   create `.claude/settings.json` ourselves; that's overstepping.
4. New flag `kb init --no-hooks` to opt out entirely.

## Configuration

Env vars only — no new config file fields.

| Var | Default | Purpose |
|---|---|---|
| `KBASE_WRITER_MODEL` | `claude-sonnet-4-5` | Writer subagent model |
| `KBASE_HOOKS_DISABLED` | unset | Set `1` to no-op both hooks |
| `KBASE_MIN_DECISION_LEN` | `80` | Min char length for `decision` |
| `KBASE_HOOK_LOG` | `.knowledge/_cache/hook.log` | Override log path |

Existing `ANTHROPIC_API_KEY` and `KBASE_LLM_PROVIDER` are reused.

## Telemetry

Single append-only log at `.knowledge/_cache/hook.log` (gitignored, fits
the existing `_cache/` convention). One JSON record per hook invocation:

```json
{"ts":"2026-04-15T...","event":"hook-write","gate":"proceed","latency_ms":1247,"entries_written":1,"model":"claude-sonnet-4-5","input_tokens":4823,"output_tokens":312}
{"ts":"...","event":"hook-write","gate":"skip","reason":"no-diff-no-edits","latency_ms":3}
{"ts":"...","event":"hook-read","gate":"proceed","latency_ms":284,"entries_injected":2,"resolution":"path-extraction"}
```

No new CLI for inspection — `tail -f` and `jq` are sufficient.

## README impact

The headline setup story shrinks to:

```bash
npm install -g kbase-mcp
cd your-project
kb init                                # creates .knowledge/ AND wires hooks
export ANTHROPIC_API_KEY=sk-ant-...
# Done. Open Claude Code and start working.
```

The MCP-setup section (`claude mcp add kbase`) and the CLAUDE.md
imperative-instructions block are demoted to a "manual integration"
appendix for users who want the agent to call kbase tools directly.
The instruction block is no longer required for normal operation —
that's the whole point.

## Open questions

None blocking. Items deferred for post-implementation observation:

- Whether the post-write dedupe sweep (layer 3) is needed in practice.
  Decide based on `hook.log` data after a few weeks of real use.
- Whether the regex path-extraction step in `hook-read` should also try
  fuzzy filename matching (e.g., user types `session.ts` and we have
  `src/auth/session.ts`). Ship literal-match-only first.
- Whether `kb init` should warn when it detects an existing CLAUDE.md
  with the old "kbase MCP tools are required" instruction block, since
  it's no longer needed. Probably yes — silent staleness is worse than
  a one-time print.
