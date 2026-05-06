import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface HookLogEntry {
  ts: string;
  event: "hook-read" | "hook-write" | "hook-session-start";
  gate: "proceed" | "skip";
  reason?: string;
  latency_ms?: number;
  entries_written?: number;
  entries_injected?: number;
  resolution?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
}

export async function appendHookLog(
  knowledgeDir: string,
  entry: HookLogEntry,
): Promise<void> {
  const cacheDir = join(knowledgeDir, "_cache");
  await mkdir(cacheDir, { recursive: true });
  const logPath = join(cacheDir, "hook.log");
  await appendFile(logPath, JSON.stringify(entry) + "\n", "utf-8");
}
