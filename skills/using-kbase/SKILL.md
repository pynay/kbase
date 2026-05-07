---
name: using-kbase
description: Use when starting any session in a project with a .knowledge/ directory — establishes that injected entries are load-bearing and that decisions get recorded automatically as you work
---

# Using kbase

This project uses kbase. Knowledge entries describing *why* code is the way
it is live in `.knowledge/<module>/<id>.md` files.

## Reading: what happens automatically

Before each of your turns, the kbase hook injects relevant entries into
your context under the heading **"Relevant kbase knowledge entries
(REQUIRED CONTEXT)"**. You will see them at the top of your input.

You **MUST** consult those entries before modifying the files they
describe. Treat them as load-bearing constraints, not background reading.
If your plan contradicts an entry, surface that explicitly to the user —
do not silently override.

## Writing: also automatic, driven by you

When you make a non-obvious choice between alternatives — a decision a
future reader would miss — **write the entry yourself** using `Write` to
`.knowledge/<module>/<uuid>.md`. Don't wait for the user to ask. Don't
suggest a slash command and stop there. Just record it as part of the
turn that produced the decision.

Mention briefly in your response that you recorded it (one sentence,
include the entry path), and offer to remove it if the user disagrees
that the decision was worth recording. The user has already authorized
you to write source code; writing a knowledge entry is not a meaningfully
different trust boundary.

See the `recording-decisions` skill for what counts as recordable and the
exact entry format.

## Available slash commands

- `/kb-init` — create `.knowledge/` in the current project
- `/kb-ask <question>` — natural-language Q&A over the knowledge base
- `/kb-impact <file>` — blast radius analysis for a file or module
- `/kb-capture` — manual escape hatch: record a decision when the user
  noticed something you didn't, or when the decision was conversational
  (no code edit) so the auto-capture path didn't fire

## Behavioral skills

When the situation matches their description, invoke these via the Skill tool:

- `consulting-knowledge` — how to act on injected entries
- `recording-decisions` — what makes a recordable decision and how to write entries
- `tracing-dependencies` — when to walk the dep graph before a refactor
