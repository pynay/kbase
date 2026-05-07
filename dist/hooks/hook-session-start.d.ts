interface SessionStartHookInput {
    cwd: string;
}
interface SessionStartHookOutput {
    additionalContext: string;
}
export declare function processSessionStartHook(input: SessionStartHookInput): Promise<SessionStartHookOutput | null>;
export {};
//# sourceMappingURL=hook-session-start.d.ts.map