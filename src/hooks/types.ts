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
 * Response shape for UserPromptSubmit hooks that inject context.
 */
export interface HookContextResponse {
  hookSpecificOutput: {
    additionalContext: string;
  };
}

/**
 * Env-var-driven config for hook behavior.
 */
export interface HookConfig {
  disabled: boolean;
  hookLogPath: string | null;
}

export function loadHookConfig(): HookConfig {
  return {
    disabled: process.env.KBASE_HOOKS_DISABLED === "1",
    hookLogPath: process.env.KBASE_HOOK_LOG ?? null,
  };
}
