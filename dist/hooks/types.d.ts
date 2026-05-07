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
 * Env-var-driven config for hook behavior.
 */
export interface HookConfig {
    disabled: boolean;
    hookLogPath: string | null;
}
export declare function loadHookConfig(): HookConfig;
//# sourceMappingURL=types.d.ts.map