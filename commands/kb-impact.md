---
description: Blast radius analysis for a file or module — what could break, what to test. Usage — /kb-impact <file-or-module>
---

The user wants to know what could break if they change a specific file or
module.

Target: $ARGUMENTS

Steps:

1. Use `Read` to load `.knowledge/_graph/dependencies.json`. It maps
   `module → { depends_on: [...], depended_on_by: [...] }`.

2. Use `Read` to load `.knowledge/_graph/files.json` (file path → entry
   ids) so you can find entries about the target.

3. Determine the blast radius:
   - If the target is a file path, look it up in `files.json` to find
     the owning module(s), then walk `depended_on_by` from there.
   - If the target is a module name, walk `depended_on_by` directly.

4. For each module in the radius, find its entries via the module index
   (`Read .knowledge/_graph/modules.json`) and load the entries with
   `Glob` + `Read`.

5. Synthesize a blast-radius report:

> **Affected modules:** module-a, module-b, ...
>
> **What could break:**
> - <one bullet per real risk drawn from the entries' `risk` and
>   `assumptions` fields>
>
> **What to test:**
> - <concrete tests/checks suggested by the entries>
>
> **Sources:** entry-id-1, entry-id-2, ...

If no entries exist for the affected modules, report that the blast
radius is unknown — the user should record entries for these modules
before assuming the change is safe.
