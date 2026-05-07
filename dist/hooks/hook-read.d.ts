interface ReadHookInput {
    prompt: string;
    cwd: string;
}
interface ReadHookOutput {
    additionalContext: string;
}
export declare function processReadHook(input: ReadHookInput): Promise<ReadHookOutput | null>;
export {};
//# sourceMappingURL=hook-read.d.ts.map