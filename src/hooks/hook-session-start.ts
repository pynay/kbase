import { findKnowledgeDir } from "../core/store.js";
import { appendHookLog } from "./log.js";
import { loadHookConfig } from "./types.js";

interface SessionStartHookInput {
  cwd: string;
}

interface SessionStartHookOutput {
  additionalContext: string;
}

/**
 * One-shot framing message injected at SessionStart. Tells the agent that
 * kbase entries will appear before each prompt and that they are
 * load-bearing — not background reading. The session-level frame
 * complements the per-prompt UserPromptSubmit injection: even on turns
 * where no entries are injected, the agent knows the system exists and
 * what it's for.
 */
const SESSION_FRAMING = `## kbase is active in this project

This project uses kbase. Before each of your turns, relevant knowledge
entries describing *why* code is the way it is will be injected into
your context under the heading "Relevant kbase knowledge entries
(REQUIRED CONTEXT)".

You MUST consult those entries before modifying the files they
describe. Treat them as load-bearing constraints, not background
reading. If your plan contradicts an entry, surface that explicitly to
the user — do not silently override.

After each meaningful turn (real diffs or write-class tool use), a
separate writer process records new decisions automatically. You do
not need to call write_knowledge yourself.`;

export async function processSessionStartHook(
  input: SessionStartHookInput,
): Promise<SessionStartHookOutput | null> {
  const config = loadHookConfig();
  if (config.disabled) return null;

  const startMs = Date.now();
  let knowledgeDir: string | null;
  try {
    knowledgeDir = await findKnowledgeDir(input.cwd);
  } catch {
    return null;
  }
  if (!knowledgeDir) return null;

  await appendHookLog(knowledgeDir, {
    ts: new Date().toISOString(),
    event: "hook-session-start",
    gate: "proceed",
    latency_ms: Date.now() - startMs,
  });

  return { additionalContext: SESSION_FRAMING };
}
