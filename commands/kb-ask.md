---
description: Natural-language Q&A over the project's knowledge base. Usage — /kb-ask <question>
---

The user is asking a question about decisions or context recorded in this
project's `.knowledge/` directory.

User's question: $ARGUMENTS

Steps:

1. Use `Glob` to find all knowledge entries:
   ```
   .knowledge/**/*.md
   ```
   Exclude `.knowledge/_graph/` and `.knowledge/index.md` from the results.

2. Use `Read` to load every matching entry. Each is markdown with YAML
   frontmatter (`module`, `summary`, `files`, `depends_on`, etc.) followed
   by `## Decision` / `## Alternatives` / `## Assumptions` / `## Risk`
   sections.

3. Identify the entries that are relevant to the user's question.
   Relevance signals: matching keywords in `summary`/`decision`,
   matching file paths in `files`, matching module names.

4. Synthesize an answer from the relevant entries. Cite which entries
   you used by their `id` (the filename minus `.md`).

5. If no entries are relevant, say so directly. Do not fabricate. Suggest
   the user check whether the topic has been recorded yet.

Format your answer as:

> **Answer:** <synthesized answer in 1-3 paragraphs>
>
> **Sources:** entry-id-1, entry-id-2, ...
