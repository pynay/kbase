# kbase

A codebase knowledge layer for AI coding agents. kbase captures *why* code works the way it does — decisions, assumptions, dependencies, risks — and makes that knowledge queryable by both agents and developers.

Knowledge lives as structured markdown files in a `.knowledge/` directory, versioned with git. No database, no vector store, no cloud. If kbase disappears, the knowledge is still readable files in your repo.

## 60-second setup

```bash
# 1. Install
npm install -g kbase-mcp

# 2. In your project
cd your-project
kb init

# 3. Set your LLM API key (for smart commands)
export ANTHROPIC_API_KEY=sk-ant-...
# or: export OPENAI_API_KEY=sk-... && export KBASE_LLM_PROVIDER=openai

# 4. Wire MCP into your agent
claude mcp add kbase -- kb-mcp          # Claude Code
# or add to .cursor/mcp.json for Cursor (see below)

# 5. Add to your project's CLAUDE.md or .cursorrules:
```

```markdown
## kbase

**kbase MCP tools are required for all work in this project.**

1. Before reading, analyzing, or modifying any source file, call `read_knowledge({ target: <file or module> })` first.
2. Before refactors spanning multiple modules, also call `query_deps({ module: <module> })`.
3. After any non-trivial change or decision, call `write_knowledge` to record it.
```

```bash
# 6. Done. Open a new agent session and start working.
#    Your agent will read existing knowledge before touching files
#    and record decisions after making changes.
```

## What it does

kbase has two surfaces:

- **An MCP server** (`kb-mcp`) exposed to coding agents with three tools: `read_knowledge`, `write_knowledge`, `query_deps`. Agents read existing knowledge before changing code and record their decisions after.
- **A CLI** (`kb`) for developers. Ask questions and get answers grounded in real decisions and real code, not generic documentation.

## MCP setup

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

- **`kb init`** — Initialize `.knowledge/` in the current directory.
- **`kb reindex`** — Rebuild `_graph/` indexes and `index.md` from the markdown entries.
- **`kb deps <module>`** — Show the dependency tree for a module. `--up`, `--down`, `--json`.
- **`kb assumptions [module]`** — List assumptions, optionally filtered by module.
- **`kb history <module>`** — Chronological decision log for a module.
- **`kb search <query>`** — Substring search across entries. `--json`.
- **`kb stale`** — Detect entries whose referenced files have been modified since the entry was written.

### Smart commands (LLM-powered, require API key)

- **`kb explain <file>`** — Walkthrough of a file, grounded in knowledge entries. Highlights non-obvious behavior, load-bearing lines, and baked-in assumptions. `--json` dumps context without calling the LLM.
- **`kb impact <file>`** — Blast radius analysis. Walks the dependency graph, pulls entries for affected modules, reports what could break and what to test. `--json`.
- **`kb ask <question>`** — Natural-language Q&A over the knowledge base. `--deep` also reads referenced source files. `--sources` lists which entries were used.

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

- **`kb-mcp` not found by Claude Code**: GUI-spawned processes may have a minimal PATH. Fix: `claude mcp add kbase -- node $(which kb-mcp)`
- **`No .knowledge/ directory found`**: Run `kb init` in your project first.
- **`No API key for openai`**: Set `KBASE_LLM_PROVIDER=openai` explicitly — default is `anthropic`.
- **Agent doesn't call kbase tools**: Make the CLAUDE.md instructions imperative ("required", "must") not advisory ("please", "consider").
- **`kb ask` returns no results**: The knowledge base is empty. Have your agent record decisions with `write_knowledge` first.

## How it works

1. **Agent writes.** After non-trivial changes, the agent calls `write_knowledge`. kbase writes a markdown entry and rebuilds the indexes.
2. **Agent reads.** Before touching code, the agent calls `read_knowledge`. kbase returns matching entries from the indexes.
3. **Developer asks.** `kb ask "..."` or `kb explain <file>` gathers relevant entries, builds a prompt, and streams the LLM's answer.
4. **Staleness shows.** `kb stale` flags entries whose referenced files have changed since the entry was written.

## License

MIT.
