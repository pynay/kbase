# kbase

A Claude Code plugin that fights **comprehension debt** — the cost of code
being hard to understand because the *why* behind it has been lost.

kbase captures the reasoning behind your code (decisions, alternatives,
assumptions, risks) at the moment it's made, and re-surfaces that context
to the agent automatically the next time you work on the same code.

Knowledge lives as structured markdown files in a `.knowledge/` directory,
versioned with git. No database, no vector store, no cloud, no API key.

## What is comprehension debt?

Technical debt is the cost of code being hard to *change*. Comprehension
debt is the cost of code being hard to *understand* — specifically, the
cost of having forgotten *why* it's the way it is. Concrete forms:

- A workaround whose original cause no one remembers, so it never gets
  removed even when the cause is gone.
- A function signature that's load-bearing for reasons not visible from
  imports, so a refactor breaks something distant and surprising.
- An assumption baked silently into the code, so a future change
  violates it and ships a subtle bug.
- An architectural choice with rejected alternatives nobody documented,
  so the same alternatives get re-litigated every six months.

Comprehension debt makes code dangerous to change. kbase reduces it by
recording the *why* alongside the code, in the same workflow that
produces and consumes both.

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
gives Claude Code three behaviors:

1. **At session start** — injects a framing message telling the agent
   kbase is active and how to use injected entries.
2. **Before each prompt** — extracts file paths from your prompt, looks
   them up in the knowledge index, and injects matching entries as
   `REQUIRED CONTEXT` for the agent to consult.
3. **After non-obvious decisions** — the agent writes a knowledge entry
   on its own using its built-in `Write` tool, mentions the entry path
   in its response, and offers to remove it if you disagree. No slash
   command required for the common case.

Most decisions get captured without you doing anything — that's the
point. The `/kb-capture` slash command is a manual escape hatch for when
you want to record something the agent missed (often a decision you made
conversationally without the agent editing code).

## Slash commands

- `/kb-init` — set up `.knowledge/` in the current project
- `/kb-ask <question>` — natural-language Q&A over recorded knowledge
- `/kb-impact <file>` — blast radius analysis for a file or module
- `/kb-capture` — manual escape hatch for capturing a decision the agent
  didn't auto-record

## Behavioral skills

The plugin ships skills the agent invokes when their description matches:

- `using-kbase` — meta-skill, injected at session start
- `consulting-knowledge` — how to act on injected entries when modifying code
- `recording-decisions` — when and how to write knowledge entries directly
- `tracing-dependencies` — when to walk the dep graph before refactors

## Entry format

Each knowledge entry is a single markdown file with YAML frontmatter:

```markdown
---
id: <uuid>
module: auth/session
summary: Session tokens use JWT
timestamp: 2026-05-06T15:00:00Z
agent: claude-code
files:
  - src/auth/session.ts
---

## Decision

We chose JWT for session tokens because they are stateless and verifiable
without a database lookup. The token-table alternative would have added
write-path latency we couldn't accept for sub-50ms login budgets.

## Alternatives

- Server-side sessions with Redis
- Opaque tokens with a token table

## Assumptions

- Token signing key is rotated quarterly via env var
```

`Decision` is required. `Alternatives`, `Assumptions`, and `Risk` are
optional — the agent fills in only what it knows.

## Data layout

```
.knowledge/
├── auth/
│   └── <uuid>.md         # one file per decision (committed)
├── _graph/               # derived indexes (gitignored, regenerated)
└── _cache/               # per-developer cache (gitignored)
```

## Configuration

One environment variable, optional:

| Var | Default | Purpose |
|---|---|---|
| `KBASE_HOOKS_DISABLED` | unset | Set `1` to disable kbase hooks for this session |

The hook event log lives at `.knowledge/_cache/hook.log`.

No API key required. All LLM work runs inside your Claude Code session.

## License

MIT.
