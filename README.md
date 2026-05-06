# kbase

A codebase knowledge layer for AI coding agents. kbase captures *why* code works the way it does — decisions, assumptions, dependencies, risks — and makes that knowledge queryable by both agents and developers.

Knowledge lives as structured markdown files in a `.knowledge/` directory, versioned with git. No database, no vector store, no cloud. If kbase disappears, the knowledge is still readable files in your repo.

## 60-second setup

```bash
# 1. Install
npm install -g kbase-mcp

# 2. In your project
cd your-project
kb init     # creates .knowledge/ and wires Claude Code hooks

# 3. Set your LLM API key (for smart commands and hook-based KB writes)
export ANTHROPIC_API_KEY=sk-ant-...
# or: export OPENAI_API_KEY=sk-... && export KBASE_LLM_PROVIDER=openai

# 4. Done. Open Claude Code and start working.
#    kbase reads relevant entries into every prompt automatically
#    and records decisions after meaningful agent turns.
```

## What it does

kbase has three surfaces:

- **Hook-based automation** — two Claude Code hooks (`UserPromptSubmit`, `Stop`) inject relevant knowledge before each prompt and dispatch a dedicated writer subprocess after each meaningful turn. The primary agent never needs to know kbase exists.
- **An MCP server** (`kb-mcp`) for manual integration with coding agents that support MCP (Claude Code, Cursor). Agents call `read_knowledge`, `write_knowledge`, `query_deps`.
- **A CLI** (`kb`) for developers. Ask questions and get answers grounded in real decisions and real code.

## How hooks work

1. **At session start** — the `SessionStart` hook runs `kb hook-session-start`. It injects a one-shot framing message telling the agent that kbase is active, that knowledge entries will appear before each prompt, and that those entries are load-bearing constraints rather than background reading. Without this frame, agents on turns where no entries are injected don't know the system exists at all.

2. **Before each prompt** — the `UserPromptSubmit` hook runs `kb hook-read`. It extracts file/module references from your prompt, looks them up in the knowledge index, and injects matching entries as additional context under a `REQUIRED CONTEXT` heading with imperative wording. If no explicit references are found, a fast Haiku classifier identifies relevant modules.

3. **After each agent turn** — the `Stop` hook runs `kb hook-write`. A cheap pre-filter checks whether the turn produced any changes (git diff or write-class tool calls). If so, it forks a background Sonnet subprocess that reads the conversation excerpt and diff, decides whether a real decision was made, and records it via `write_knowledge`. Most turns produce no entry — that's expected.

All three hooks fail silently and never block your session.

## Hook configuration

| Variable | Default | Purpose |
|---|---|---|
| `KBASE_HOOKS_DISABLED` | unset | Set `1` to disable all three hooks |
| `KBASE_WRITER_MODEL` | `claude-sonnet-4-5` | Override the writer subprocess model |
| `KBASE_MIN_DECISION_LEN` | `80` | Minimum character length for the `decision` field |
| `KBASE_HOOK_LOG` | `.knowledge/_cache/hook.log` | Override hook log path |

## Manual MCP setup

> MCP setup is optional if you're using Claude Code hooks (the default after `kb init`). Use this section if you want the primary agent to call kbase tools directly, or if you're using Cursor or another MCP-compatible tool.

### Claude Code

```bash
claude mcp add kbase -- kb-mcp
```

> **Troubleshooting**: If Claude Code can't find `kb-mcp`, register with an absolute path instead:
> `claude mcp add kbase -- node $(which kb-mcp)`

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kbase": { "command": "kb-mcp" }
  }
}
```

### Agent instructions

Add to `CLAUDE.md`, `.cursorrules`, or `AGENTS.md` in your project:

```markdown
## kbase

**kbase MCP tools are required for all work in this project.**

1. Before reading, analyzing, or modifying any source file, call `read_knowledge({ target: <file or module> })` first. This applies to reviews and suggestions, not just edits.
2. Before refactors spanning multiple modules, also call `query_deps({ module: <module> })`.
3. After any non-trivial change or decision, call `write_knowledge` to record what you decided and why.

These steps are required, not optional.
```

## MCP tools

Three tools, exposed over stdio.

**`read_knowledge(target, depth?)`**
Target-based lookup. `target` is a module name (e.g. `"auth/session"`) or a file path (e.g. `"src/auth/session.ts"`). `depth: "summary"` (default) returns frontmatter-only entries; `depth: "full"` returns complete entries with the decision body. Returns `[]` if nothing matches — a valid answer, not an error.

**`write_knowledge({ module, summary, decision, files, ... })`**
Creates a new knowledge entry under `.knowledge/<module>/<id>.md`. Rebuilds indexes automatically so the next read sees it immediately. `module`, `summary`, `decision`, and `files` are required; `alternatives`, `assumptions`, `risk`, `affects`, `depends_on`, and `tags` are optional.

**`query_deps(module, direction?)`**
Dependency graph lookup. `direction: "up"` returns upstream dependencies, `"down"` returns downstream dependents, `"both"` (default) returns both.

## CLI

### Static commands (no LLM, no API key)

- **`kb init`** — Initialize `.knowledge/` in the current directory and wire Claude Code hooks.
- **`kb reindex`** — Rebuild `_graph/` indexes and `index.md` from the markdown entries.
- **`kb deps <module>`** — Show the dependency tree for a module. `--up`, `--down`, `--json`.
- **`kb search <query>`** — Substring search across entries. `--json`.
- **`kb stale`** — Detect entries whose referenced files have been modified since the entry was written.

### Smart commands (LLM-powered, require API key)

- **`kb impact <file>`** — Blast radius analysis. Walks the dependency graph, pulls entries for affected modules, reports what could break and what to test. `--json`.
- **`kb ask <question>`** — Natural-language Q&A over the knowledge base. `--deep` also reads referenced source files. `--sources` lists which entries were used. `--json` dumps gathered context without calling the LLM.

## Configuration

Smart commands need an LLM API key:

**Environment variables** (take precedence):
```bash
export ANTHROPIC_API_KEY=sk-ant-...          # if using Anthropic (default)
export OPENAI_API_KEY=sk-...                  # if using OpenAI
export KBASE_LLM_PROVIDER=openai              # must set if using OpenAI
export KBASE_LLM_MODEL=gpt-4o                 # optional
```

**Config file** at `~/.kbase/config.json`:
```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-...",
  "model": "claude-sonnet-4-5"
}
```

Both Anthropic and OpenAI-compatible endpoints are supported.

## Data layout

```
.knowledge/
├── index.md              # Auto-generated overview (rebuilt on every write)
├── auth/
│   └── <entry-id>.md     # One file per decision, YAML frontmatter + markdown body
├── _graph/               # Derived indexes (committed, rebuilt by kb reindex)
│   ├── modules.json      # module → entry ids
│   ├── files.json        # file path → entry ids
│   ├── dependencies.json # module → { depends_on, depended_on_by }
│   └── assumptions.json  # module → [{ assumption, entry_id }]
└── _cache/               # Per-developer disposable cache (gitignored)
```

## Troubleshooting

- **Hooks not firing**: Run `kb init` to wire hooks into `.claude/settings.json`. Check that `KBASE_HOOKS_DISABLED` is not set to `1`. Inspect `.knowledge/_cache/hook.log` for gate decisions.
- **`kb-mcp` not found by Claude Code**: GUI-spawned processes may have a minimal PATH. Fix: `claude mcp add kbase -- node $(which kb-mcp)`
- **`No .knowledge/ directory found`**: Run `kb init` in your project first.
- **`No API key for openai`**: Set `KBASE_LLM_PROVIDER=openai` explicitly — default is `anthropic`.
- **Agent doesn't call kbase tools**: Make the CLAUDE.md instructions imperative ("required", "must") not advisory ("please", "consider").
- **`kb ask` returns no results**: The knowledge base is empty. Have your agent record decisions with `write_knowledge` first.

## How it works

1. **Hooks inject and record.** `kb hook-read` injects relevant knowledge before each prompt. `kb hook-write` dispatches a writer subprocess after meaningful turns. The primary agent never calls kbase tools directly.
2. **Agent writes (manual).** If not using hooks, agents call `write_knowledge` via MCP after non-trivial changes. kbase writes a markdown entry and rebuilds indexes.
3. **Agent reads (manual).** If not using hooks, agents call `read_knowledge` via MCP before touching code.
4. **Developer asks.** `kb ask "..."` or `kb impact <file>` gathers relevant entries, builds a prompt, and streams the LLM's answer.
5. **Staleness shows.** `kb stale` flags entries whose referenced files have changed since the entry was written.

## License

MIT.
