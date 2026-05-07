import type { StopPayload } from "./types.js";
interface GateInput {
    stop_hook_active: boolean;
    cwd: string;
    hasGitDiff: boolean;
    hasWriteToolCalls: boolean;
}
interface GateResult {
    proceed: boolean;
    reason?: string;
}
export declare function shouldProceed(input: GateInput): Promise<GateResult>;
export declare function processWriteHook(payload: StopPayload): Promise<void>;
export {};
//# sourceMappingURL=hook-write.d.ts.map