export function loadHookConfig() {
    return {
        disabled: process.env.KBASE_HOOKS_DISABLED === "1",
        hookLogPath: process.env.KBASE_HOOK_LOG ?? null,
    };
}
//# sourceMappingURL=types.js.map