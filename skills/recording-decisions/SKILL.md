---
name: recording-decisions
description: Use when you have just made a non-obvious choice between alternatives, introduced a load-bearing assumption, or made a change a future reader might not understand — write the knowledge entry directly without waiting for the user to ask
---

# Recording Decisions

## When to use

You just produced a turn that contains:
- A non-obvious choice between alternatives, with reasoning the user wouldn't infer from the diff
- A load-bearing assumption (e.g., "this only works because X is always true")
- A constraint or risk introduced or relied on by the change
- A dependency that's load-bearing but not visible from imports

If any of those apply, this skill fires.

## What does NOT count

Returning *no* entry is the right answer most of the time. Do not record:
- Restating what the diff shows ("added a function that returns X")
- Formatting / stylistic changes
- Pure renames where semantics are unchanged
- Bug fixes where the fix is self-explanatory from the diff
- Test additions without a novel testing strategy

If you're not sure whether the decision is recordable, lean toward not
recording. False positives are worse than false negatives — they pollute
the knowledge base with noise.

## What to do

When the criteria above match, **write the entry yourself in this same
turn**. Don't suggest a slash command. Don't wait for the user to ask.

### 1. Generate a UUID for the entry id

Use the `Bash` tool:

```bash
node -e "console.log(crypto.randomUUID())"
```

Take the output as `<uuid>`. The entry filename will be `<uuid>.md`.

### 2. Pick the smallest accurate module scope

The module is the directory under `.knowledge/`. Use the smallest
accurate scope (e.g., `auth/session`, not `auth`). Look at the files the
change touches and pick the deepest shared parent that's still meaningful.

### 3. Write the entry

Use the `Write` tool to create `.knowledge/<module>/<uuid>.md`. Format:

```markdown
---
id: <uuid>
module: <module>
summary: <one-sentence headline>
timestamp: <ISO 8601 timestamp from `node -e "console.log(new Date().toISOString())"`>
agent: claude-code
files:
  - <file path 1>
  - <file path 2>
---

## Decision

<2-5 sentences explaining the why. The diff shows the what; this section
supplies the why. Be specific about reasoning. Must be at least 80
characters.>

## Alternatives

- <alternative considered and rejected>
- <another alternative>

## Assumptions

- <load-bearing assumption introduced>

## Risk

<Optional. What could go wrong if this assumption breaks.>
```

Required fields: `id`, `module`, `summary`, `timestamp`, `agent`, `files`,
and the `## Decision` body. The `## Alternatives`, `## Assumptions`, and
`## Risk` sections are optional — include only what you genuinely know
from the conversation.

### 4. Mention it in your response

Tell the user briefly (one sentence) that you recorded it, and offer to
remove if they disagree the decision was worth keeping:

> I recorded this decision at `.knowledge/<module>/<uuid>.md` — let me
> know if you want it removed.

This is one line. Don't dwell on it. The user can read the diff if they
want details.

### 5. Don't regenerate the dep graph

`.knowledge/_graph/` is gitignored and regenerated lazily on read. Don't
spend the turn rebuilding it.

## Manual override

The user can run `/kb-capture` if you missed a decision they want
recorded. That's the escape hatch — don't rely on it to backstop your
judgment, but don't be defensive about it either when the user uses it.
