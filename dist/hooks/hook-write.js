import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { findKnowledgeDir } from "../core/store.js";
import { parseTranscriptTail, hasToolCalls } from "./transcript.js";
import { appendHookLog } from "./log.js";
import { loadHookConfig } from "./types.js";
export async function shouldProceed(input) {
    if (input.stop_hook_active) {
        return { proceed: false, reason: "stop-hook-active" };
    }
    const knowledgeDir = await findKnowledgeDir(input.cwd);
    if (!knowledgeDir) {
        return { proceed: false, reason: "no-knowledge-dir" };
    }
    if (!input.hasGitDiff && !input.hasWriteToolCalls) {
        return { proceed: false, reason: "no-diff-no-edits" };
    }
    return { proceed: true };
}
export async function processWriteHook(payload) {
    const config = loadHookConfig();
    if (config.disabled)
        return;
    const startMs = Date.now();
    const knowledgeDir = await findKnowledgeDir(payload.cwd);
    let gitDiff = "";
    try {
        gitDiff = execSync("git diff HEAD", {
            cwd: payload.cwd,
            encoding: "utf-8",
            timeout: 5000,
        }).trim();
    }
    catch {
        // no git or no diff
    }
    const tail = await parseTranscriptTail(payload.transcript_path);
    const hasWriteTools = hasToolCalls(tail.toolNames);
    const gate = await shouldProceed({
        stop_hook_active: payload.stop_hook_active,
        cwd: payload.cwd,
        hasGitDiff: gitDiff.length > 0,
        hasWriteToolCalls: hasWriteTools,
    });
    if (!gate.proceed) {
        if (knowledgeDir) {
            await appendHookLog(knowledgeDir, {
                ts: new Date().toISOString(),
                event: "hook-write",
                gate: "skip",
                reason: gate.reason,
                latency_ms: Date.now() - startMs,
            });
        }
        return;
    }
    const writerPayload = {
        transcript_excerpt: tail.raw,
        git_diff: gitDiff,
        cwd: payload.cwd,
        knowledge_dir: knowledgeDir,
    };
    const child = spawn(process.execPath, [
        new URL("./writer-entry.js", import.meta.url).pathname,
        JSON.stringify(writerPayload),
        JSON.stringify(config),
    ], {
        detached: true,
        stdio: "ignore",
        cwd: payload.cwd,
        env: { ...process.env },
    });
    child.unref();
    if (knowledgeDir) {
        await appendHookLog(knowledgeDir, {
            ts: new Date().toISOString(),
            event: "hook-write",
            gate: "proceed",
            latency_ms: Date.now() - startMs,
        });
    }
}
//# sourceMappingURL=hook-write.js.map