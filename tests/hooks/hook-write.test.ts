import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { shouldProceed } from "../../src/hooks/hook-write.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("shouldProceed", () => {
  let projectDir: string;
  let knowledgeDir: string;

  beforeEach(async () => {
    projectDir = join(tmpdir(), `kbase-hookwrite-test-${Date.now()}`);
    knowledgeDir = join(projectDir, ".knowledge");
    await mkdir(knowledgeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it("returns false when stop_hook_active is true", async () => {
    const result = await shouldProceed({
      stop_hook_active: true,
      cwd: projectDir,
      hasGitDiff: false,
      hasWriteToolCalls: false,
    });
    expect(result.proceed).toBe(false);
    expect(result.reason).toBe("stop-hook-active");
  });

  it("returns false when .knowledge/ does not exist", async () => {
    const result = await shouldProceed({
      stop_hook_active: false,
      cwd: "/nonexistent",
      hasGitDiff: false,
      hasWriteToolCalls: false,
    });
    expect(result.proceed).toBe(false);
    expect(result.reason).toBe("no-knowledge-dir");
  });

  it("returns false when no diff and no write tool calls", async () => {
    const result = await shouldProceed({
      stop_hook_active: false,
      cwd: projectDir,
      hasGitDiff: false,
      hasWriteToolCalls: false,
    });
    expect(result.proceed).toBe(false);
    expect(result.reason).toBe("no-diff-no-edits");
  });

  it("returns true when git diff is present", async () => {
    const result = await shouldProceed({
      stop_hook_active: false,
      cwd: projectDir,
      hasGitDiff: true,
      hasWriteToolCalls: false,
    });
    expect(result.proceed).toBe(true);
  });

  it("returns true when write tool calls are present", async () => {
    const result = await shouldProceed({
      stop_hook_active: false,
      cwd: projectDir,
      hasGitDiff: false,
      hasWriteToolCalls: true,
    });
    expect(result.proceed).toBe(true);
  });
});
