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
