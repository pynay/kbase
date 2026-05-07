---
description: Record a knowledge entry from the most recent meaningful turn. Usage — /kb-capture
---

The user wants to capture a knowledge entry from their recent work.

Steps:

1. Use `Bash` to inspect the recent diff:
   ```bash
   git diff HEAD --stat && git diff HEAD
   ```

2. Use `Read` to inspect the recent transcript turns. The transcript
   path is provided by Claude Code as a session-level path; if you
   don't have it, ask the user to paste a brief summary of what they
   just decided.

3. **Decide whether a recordable decision was made.** Use the
   `recording-decisions` skill's criteria:
   - Non-obvious choice between alternatives, with reasoning
   - Load-bearing assumption a future reader would miss
   - Constraint or risk the change introduces
   - Load-bearing dependency not visible from imports

   **Returning nothing is the correct answer most of the time.** If
   nothing in the diff or recent turns rises to the bar, tell the user:

   > No recordable decision detected in the recent turn. The diff
   > looks like <summary>. If you disagree, describe the decision and
   > I'll record it.

4. **If a decision was made**, ask the user to confirm the module and
   summary before writing:

   > I'll record this as:
   > - module: <smallest accurate scope>
   > - summary: <one sentence>
   > - decision: <2-5 sentence why>
   > - files: <paths from the diff>
   >
   > OK to record? (You can edit any field.)

5. **After confirmation**, write the entry. The entry path is
   `.knowledge/<module>/<uuid>.md` where `<uuid>` is a UUID v4 you
   generate. The format is YAML frontmatter + body. Use the `Write` tool.

   Example:

   ```markdown
   ---
   id: <uuid>
   module: auth/session
   summary: Session tokens use JWT
   timestamp: 2026-05-06T15:00:00Z
   agent: kb-capture
   files:
     - src/auth/session.ts
   ---

   ## Decision

   We chose JWT for session tokens because they are stateless and
   verifiable without a database lookup. <continue with at least 80
   characters of detail>

   ## Alternatives

   - Server-side sessions with Redis
   - Opaque tokens with a token table
   ```

6. After writing, regenerate the dep graph by globbing all entries and
   rebuilding `.knowledge/_graph/*.json`. (Or skip this step if a `kb
   reindex` equivalent slash command exists — for now, keep it inline.)

7. Confirm to the user:

   > Recorded entry <uuid> under module <module>.
