---
name: tracing-dependencies
description: Use when about to refactor across multiple modules, rename a public API, or change a load-bearing interface — surfaces blast radius before changes
---

# Tracing Dependencies

## When to use

You're about to:
- Refactor a module that other modules depend on
- Rename or change the signature of a public function/type
- Change a load-bearing interface, file format, or protocol

## What to do

1. **Read the dep graph.** kbase maintains
   `.knowledge/_graph/dependencies.json` mapping
   `module → { depends_on, depended_on_by }`. Read it directly:

   ```bash
   cat .knowledge/_graph/dependencies.json
   ```

2. **Identify the blast radius.** Walk `depended_on_by` for the module
   you're changing. Every module in that list has code that may break.

3. **Pull entries for affected modules.** For each module in the blast
   radius, read its entries. Look for assumptions and risks that
   constrain your change.

4. **Surface the radius before changing.** Before producing the diff,
   tell the user: "This change affects N modules: [list]. The most
   load-bearing constraint I see is [from entry X]. Proceed?"

5. **If the user proceeds and the change introduces a new constraint,
   invoke `recording-decisions`** to suggest `/kb-capture`.
