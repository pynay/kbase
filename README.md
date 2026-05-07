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
