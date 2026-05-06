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
