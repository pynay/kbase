import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { processSessionStartHook } from "../../src/hooks/hook-session-start.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("processSessionStartHook", () => {
  let projectDir: string;
  let knowledgeDir: string;

  beforeEach(async () => {
    projectDir = join(tmpdir(), `kbase-sessionstart-test-${Date.now()}`);
    knowledgeDir = join(projectDir, ".knowledge");
    await mkdir(join(knowledgeDir, "_graph"), { recursive: true });
    await mkdir(join(knowledgeDir, "_cache"), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it("returns null when .knowledge/ does not exist", async () => {
    const result = await processSessionStartHook({ cwd: "/nonexistent" });
    expect(result).toBeNull();
  });

  it("returns null when KBASE_HOOKS_DISABLED=1", async () => {
    const prev = process.env.KBASE_HOOKS_DISABLED;
    process.env.KBASE_HOOKS_DISABLED = "1";
    try {
      const result = await processSessionStartHook({ cwd: projectDir });
      expect(result).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.KBASE_HOOKS_DISABLED;
      else process.env.KBASE_HOOKS_DISABLED = prev;
    }
  });

  it("emits an imperative framing message when .knowledge/ exists", async () => {
    const result = await processSessionStartHook({ cwd: projectDir });
    expect(result).not.toBeNull();
    expect(result!.additionalContext).toMatch(/kbase|knowledge/i);
    expect(result!.additionalContext).toMatch(/MUST|REQUIRED/);
  });
});
