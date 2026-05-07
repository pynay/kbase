---
description: Initialize kbase in the current project — creates .knowledge/ and gitignore entries
---

You are setting up kbase in the user's current project.

Steps:

1. Use the `Bash` tool to check whether `.knowledge/` already exists:
   ```bash
   ls -d .knowledge 2>/dev/null && echo EXISTS || echo MISSING
   ```

2. If MISSING, create the directory tree:
   ```bash
   mkdir -p .knowledge/_graph .knowledge/_cache
   ```

3. Write a placeholder `.knowledge/index.md` using the `Write` tool:
   ```markdown
   # Knowledge Base Index

   > No entries yet. Entries are added via `/kb-capture` after meaningful
   > decisions. The dep graph and this file regenerate as entries grow.
   ```

4. Add `.knowledge/_cache/`, `.knowledge/_graph/`, and `.knowledge/index.md`
   to `.gitignore` (append if missing). Use `Read` to inspect existing
   `.gitignore`, then `Write` (or `Edit`) to add missing lines.

5. Confirm to the user:
   > kbase initialized in this project. The kbase plugin's hooks will
   > start injecting any future knowledge entries into your prompts
   > automatically. Use `/kb-capture` to record decisions.
