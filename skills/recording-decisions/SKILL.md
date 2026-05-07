---
name: recording-decisions
description: Use when you have just made a non-obvious choice between alternatives, introduced a load-bearing assumption, or made a change a future reader might not understand — prompts the user to record it via /kb-capture
---

# Recording Decisions

## When to use

You just produced a turn that contains:
- A non-obvious choice between alternatives, with reasoning the user wouldn't infer from the diff
- A load-bearing assumption (e.g., "this only works because X is always true")
- A constraint or risk introduced or relied on by the change
- A dependency that's load-bearing but not visible from imports

If any of those apply, this skill fires.

## What to do

1. **Articulate the why in your response.** The diff shows the *what*; you
   supply the *why*. Two to five sentences. Be specific about the
   alternatives you considered and why you chose this one.

2. **Suggest the user invoke `/kb-capture`.** Don't run it for them — it's
   their call whether the decision is worth recording. Phrase it like:

   > This change introduced an assumption that <X>. If you want to record
   > it, run `/kb-capture` and I'll write a knowledge entry.

3. **Don't suggest /kb-capture for non-decisions.** Restating what the
   diff shows, formatting changes, pure renames, test additions without a
   novel testing strategy — none of these warrant a knowledge entry.
   Returning *no* suggestion is the right answer most of the time.
