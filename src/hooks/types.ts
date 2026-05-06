/**
 * Payload Claude Code pipes to UserPromptSubmit hooks via stdin.
 */
export interface UserPromptSubmitPayload {
  session_id: string;
  transcript_path: string;
  cwd: string;
  prompt: string;
}

/**
 * Payload Claude Code pipes to Stop hooks via stdin.
 */
export interface StopPayload {
  session_id: string;
  transcript_path: string;
  cwd: string;
  stop_hook_active: boolean;
}

/**
 * Payload Claude Code pipes to SessionStart hooks via stdin.
 */
export interface SessionStartPayload {
  session_id: string;
  transcript_path: string;
  cwd: string;
  source?: string;
}

/**
 * Response shape for UserPromptSubmit and SessionStart hooks that inject
 * context. Both use the same envelope per the Claude Code hooks reference.
 */
export interface HookContextResponse {
  hookSpecificOutput: {
    additionalContext: string;
  };
}

/** @deprecated alias kept so existing imports keep compiling. */
export type UserPromptSubmitResponse = HookContextResponse;

/**
 * Config for the kbase-writer subprocess, passed as serialized JSON arg.
 */
export interface WriterPayload {
  transcript_excerpt: string;
  git_diff: string;
  cwd: string;
  knowledge_dir: string;
}

/**
 * Env-var-driven config for hook behavior.
 */
export interface HookConfig {
  disabled: boolean;
  writerModel: string;
  minDecisionLen: number;
  hookLogPath: string | null; // null = use default
}

export function loadHookConfig(): HookConfig {
  return {
    disabled: process.env.KBASE_HOOKS_DISABLED === "1",
    writerModel: process.env.KBASE_WRITER_MODEL ?? "claude-sonnet-4-5",
    minDecisionLen: parseInt(process.env.KBASE_MIN_DECISION_LEN ?? "80", 10),
    hookLogPath: process.env.KBASE_HOOK_LOG ?? null,
  };
}
