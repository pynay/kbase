import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { processReadHook } from "../../src/hooks/hook-read.js";
import { shouldProceed } from "../../src/hooks/hook-write.js";
import { writeEntry } from "../../src/core/store.js";
import { rebuildAll } from "../../src/core/index.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("hook round trip (no LLM)", () => {
  let projectDir: string;
  let knowledgeDir: string;

  beforeEach(async () => {
    projectDir = join(tmpdir(), `kbase-integration-${Date.now()}`);
    knowledgeDir = join(projectDir, ".knowledge");
    await mkdir(join(knowledgeDir, "_graph"), { recursive: true });
    await mkdir(join(knowledgeDir, "_cache"), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it("hook-read injects entries matching a file path in the prompt", async () => {
    await writeEntry(knowledgeDir, {
      module: "auth/session",
      summary: "JWT chosen for statelessness",
      decision: "We chose JWT for session tokens because they can be verified without a database lookup, which keeps the auth middleware stateless.",
      files: ["src/auth/session.ts"],
    });
    await rebuildAll(knowledgeDir);

    const result = await processReadHook({
      prompt: "There's a bug in src/auth/session.ts where the token expires too early",
      cwd: projectDir,
      apiKey: null,
    });

    expect(result).not.toBeNull();
    expect(result!.additionalContext).toContain("JWT");
    expect(result!.additionalContext).toContain("auth/session");
  });

  it("hook-read returns null for unrelated prompts", async () => {
    await writeEntry(knowledgeDir, {
      module: "auth/session",
      summary: "JWT chosen for statelessness",
      decision: "We chose JWT for session tokens because they can be verified without a database lookup.",
      files: ["src/auth/session.ts"],
    });
    await rebuildAll(knowledgeDir);

    const result = await processReadHook({
      prompt: "what's for lunch",
      cwd: projectDir,
      apiKey: null,
    });

    expect(result).toBeNull();
  });

  it("hook-write gate passes when git diff is present", async () => {
    const result = await shouldProceed({
      stop_hook_active: false,
      cwd: projectDir,
      hasGitDiff: true,
      hasWriteToolCalls: false,
    });
    expect(result.proceed).toBe(true);
  });

  it("hook-write gate blocks recursive invocations", async () => {
    const result = await shouldProceed({
      stop_hook_active: true,
      cwd: projectDir,
      hasGitDiff: true,
      hasWriteToolCalls: true,
    });
    expect(result.proceed).toBe(false);
  });
});
