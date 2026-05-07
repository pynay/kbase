import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appendHookLog, HookLogEntry } from "../../src/hooks/log.js";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("appendHookLog", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `kbase-log-test-${Date.now()}`);
    await mkdir(join(dir, "_cache"), { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates hook.log and appends a JSON line", async () => {
    const entry: HookLogEntry = {
      ts: new Date().toISOString(),
      event: "hook-read",
      gate: "proceed",
      latency_ms: 42,
    };
    await appendHookLog(dir, entry);

    const content = await readFile(join(dir, "_cache", "hook.log"), "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.event).toBe("hook-read");
    expect(parsed.gate).toBe("proceed");
    expect(parsed.latency_ms).toBe(42);
  });

  it("appends multiple entries as newline-delimited JSON", async () => {
    await appendHookLog(dir, { ts: "a", event: "hook-read", gate: "skip" });
    await appendHookLog(dir, { ts: "b", event: "hook-read", gate: "proceed" });

    const lines = (await readFile(join(dir, "_cache", "hook.log"), "utf-8"))
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).event).toBe("hook-read");
    expect(JSON.parse(lines[1]).event).toBe("hook-read");
  });
});
