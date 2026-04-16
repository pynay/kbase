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
 * Response shape for UserPromptSubmit hooks that inject context.
 */
export interface UserPromptSubmitResponse {
  hookSpecificOutput: {
    additionalContext: string;
  };
}

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
