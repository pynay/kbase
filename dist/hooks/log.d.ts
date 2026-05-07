export interface HookLogEntry {
    ts: string;
    event: "hook-read";
    gate: "proceed" | "skip";
    reason?: string;
    latency_ms?: number;
    entries_injected?: number;
    resolution?: string;
}
export declare function appendHookLog(knowledgeDir: string, entry: HookLogEntry): Promise<void>;
//# sourceMappingURL=log.d.ts.map