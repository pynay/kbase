# kbase

A codebase knowledge layer for AI coding agents. kbase captures *why* code works the way it does — decisions, assumptions, dependencies, risks — and makes that knowledge queryable by both agents and developers.

Knowledge lives as structured markdown files in a `.knowledge/` directory, versioned with git. No database, no vector store, no cloud. If kbase disappears, the knowledge is still readable files in your repo.

kbase has two surfaces:

- **An MCP server** (`kb-mcp`) exposed to coding agents with three tools: `read_knowledge`, `write_knowledge`, `query_deps`. Agents read existing knowledge before changing code and record their decisions after.
- **A CLI** (`kb`) for developers. The CLI is designed around *inquiry*: you ask questions and get answers grounded in real decisions and real code, not generic documentation.

## Install

kbase is not yet published to npm. For now, build from source:

```bash
git clone <repo-url> kbase
cd kbase
npm install
npm run build
npm link    # makes `kb` and `kb-mcp` available on your PATH
```

## Quick start

```bash
# 1. Initialize kbase in your project
cd path/to/your/project
kb init

# 2. Wire the MCP server into your agent (see below)

# 3. Tell your agent to use it (add one paragraph to CLAUDE.md / .cursorrules)

# 4. Make changes. Your agent will call write_knowledge as it works.

# 5. Query later
kb ask "what could cause intermittent 401 errors?"
kb deps auth/session
kb explain src/auth/session.ts
```

## MCP setup

### Claude Code

```bash
claude mcp add kbase -- kb-mcp
```

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

Add to `CLAUDE.md`, `.cursorrules`, or `AGENTS.md`:

> This project uses kbase for codebase knowledge. Before making changes, call `read_knowledge` for the relevant module or file. After making non-trivial changes, call `write_knowledge` to document what you decided and why. Before large refactors, call `query_deps` to check the blast radius.

## MCP tools

Three tools, exposed over stdio. Schemas are designed to need one sentence of agent instruction to use correctly.

**`read_knowledge(target, depth?)`**
Target-based lookup. `target` is a module name (e.g. `"auth/session"`) or a file path (e.g. `"src/auth/session.ts"`). `depth: "summary"` (default) returns frontmatter-only entries; `depth: "full"` returns complete entries with the decision body. Returns `[]` if nothing matches — a valid answer, not an error.

**`write_knowledge({ module, summary, decision, files, ... })`**
Creates a new knowledge entry under `.knowledge/<module>/<id>.md`. Rebuilds the `_graph/` indexes and `index.md` automatically so the next read sees the new entry immediately. `module`, `summary`, `decision`, and `files` are required; `alternatives`, `assumptions`, `risk`, `affects`, `depends_on`, and `tags` are optional.

**`query_deps(module, direction?)`**
Dependency graph lookup. `direction: "up"` returns upstream dependencies (`depends_on`), `"down"` returns downstream dependents (`depended_on_by`), `"both"` (default) returns both.

## CLI

### Static commands (no LLM, no API key)

Fast, offline, deterministic. Read straight from the `_graph/` indexes.

- **`kb init`** — Initialize `.knowledge/` in the current directory.
- **`kb reindex`** — Rebuild `_graph/` indexes and `index.md` from the markdown entries.
- **`kb deps <module>`** — Show the dependency tree for a module. `--up`, `--down`, `--json`.
- **`kb assumptions [module]`** — List assumptions, optionally filtered by module.
- **`kb history <module>`** — Chronological decision log for a module.
- **`kb search <query>`** — Substring search across entries. `--json`.
- **`kb stale`** — Detect entries whose referenced files have been modified since the entry was written (via `git log`).

### Smart commands (LLM-powered, require API key)

These call an LLM and stream the response. See **Configuration** below.

- **`kb explain <file>`** — Walkthrough of a file, grounded in knowledge entries that reference it and one hop of related-module entries. Highlights non-obvious behavior, load-bearing lines, and baked-in assumptions. `--json` dumps the gathered context without calling the LLM.
- **`kb impact <file>`** — Blast radius analysis. Walks the dependency graph in both directions, pulls entries for every affected module, and reports what could break, which assumptions are at risk, and what to test. `--json` dumps the context.
- **`kb ask <question>`** — Natural-language Q&A over the knowledge base. Scores every entry by keyword matches, takes the top 10, and sends them to the LLM with the question. `--deep` also reads the source files those entries reference (slower, more thorough). `--sources` lists which entries were used.

## Configuration

Smart commands need an LLM API key. Provide it via either:

**Environment variables** (take precedence):
```bash
export ANTHROPIC_API_KEY=sk-ant-...          # if using Anthropic
export OPENAI_API_KEY=sk-...                  # if using OpenAI
export KBASE_LLM_PROVIDER=anthropic           # optional, default: anthropic
export KBASE_LLM_MODEL=claude-sonnet-4-5      # optional
```

**Config file** at `~/.kbase/config.json`:
```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-...",
  "model": "claude-sonnet-4-5"
}
```

Both Anthropic (`@anthropic-ai/sdk`) and OpenAI-compatible endpoints are supported. Set `KBASE_LLM_BASE_URL` to point at an OpenAI-compatible proxy or Azure deployment.

## Data layout

```
.knowledge/
├── index.md              # Auto-generated human-readable overview
├── auth/
│   └── <entry-id>.md     # Entry per decision, YAML frontmatter + body
├── payments/
│   └── <entry-id>.md
├── _graph/               # Derived indexes (committed, rebuilt by reindex)
│   ├── modules.json      # module → entry ids
│   ├── files.json        # file path → entry ids
│   ├── dependencies.json # module → { depends_on, depended_on_by }
│   └── assumptions.json  # module → [{ assumption, entry_id }]
└── _cache/               # Per-developer disposable cache (gitignored)
```

Entry files carry a YAML frontmatter header (id, module, summary, timestamp, agent, files, affects, depends_on, tags) and a markdown body with `## Decision`, `## Alternatives`, `## Assumptions`, and `## Risk` sections.

`_graph/` is committed so a fresh clone can run `kb deps` or `query_deps` without needing to rebuild. `_cache/` is not committed — it's for per-developer local derivatives.

## How it works

1. **Agent writes.** When your agent finishes a non-trivial change, it calls `write_knowledge` with a module, summary, the decision body, the files touched, and whatever assumptions/risks/alternatives are relevant. kbase writes the entry as markdown and rebuilds the indexes.
2. **Agent reads.** Before changing code, the agent calls `read_knowledge` with a target (module or file). kbase looks up the target in `modules.json` or `files.json` and returns matching entries at the requested depth.
3. **Developer asks.** You run `kb ask "..."` or `kb explain <file>`. The CLI gathers relevant entries from the indexes, builds a prompt with the knowledge-base context, and streams the LLM's answer.
4. **Staleness shows.** `kb stale` compares entry timestamps to `git log` for every referenced file and flags entries whose files have changed since the decision was recorded.

## Design principles

- **Markdown is the source of truth.** `_graph/` is derived, not canonical. If the indexes get corrupted, `kb reindex` regenerates them from the markdown.
- **Three MCP tools, not thirty.** Agents should need one sentence of instruction to use kbase.
- **Inquiry over retrieval.** The CLI helps developers understand code through questions, not through reading documentation.
- **Code-aware, not abstract.** Every entry maps to real files. Dependencies are between real modules.
- **Staleness is visible.** Knowledge that silently rots is worse than no knowledge.

## Full specification

See [`CLAUDE.md`](./CLAUDE.md) for the complete technical specification — data model, tool schemas, prompt templates, build order, testing strategy, and future roadmap.

## License

MIT.
