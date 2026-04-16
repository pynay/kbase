import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { processReadHook } from "../../src/hooks/hook-read.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeEntry } from "../../src/core/store.js";
import { rebuildAll } from "../../src/core/index.js";

describe("processReadHook", () => {
  let knowledgeDir: string;
  let projectDir: string;

  beforeEach(async () => {
    projectDir = join(tmpdir(), `kbase-hookread-test-${Date.now()}`);
    knowledgeDir = join(projectDir, ".knowledge");
    await mkdir(join(knowledgeDir, "_graph"), { recursive: true });
    await mkdir(join(knowledgeDir, "_cache"), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it("returns null when .knowledge/ does not exist", async () => {
    const result = await processReadHook({
      prompt: "fix the bug",
      cwd: "/nonexistent",
      apiKey: null,
    });
    expect(result).toBeNull();
  });

  it("resolves entries by explicit file path in the prompt", async () => {
    await writeEntry(knowledgeDir, {
      module: "auth/session",
      summary: "Session tokens use JWT",
      decision: "We chose JWT for session tokens because they are stateless and verifiable without a database lookup.",
      files: ["src/auth/session.ts"],
    });
    await rebuildAll(knowledgeDir);

    const result = await processReadHook({
      prompt: "fix the bug in src/auth/session.ts",
      cwd: projectDir,
      apiKey: null,
    });

    expect(result).not.toBeNull();
    expect(result!.additionalContext).toContain("Session tokens use JWT");
  });

  it("caps output at 3 entries", async () => {
    for (let i = 0; i < 5; i++) {
      await writeEntry(knowledgeDir, {
        module: "auth/session",
        summary: `Decision ${i}`,
        decision: `This is a detailed decision number ${i} that explains the reasoning behind the choice.`,
        files: ["src/auth/session.ts"],
      });
    }
    await rebuildAll(knowledgeDir);

    const result = await processReadHook({
      prompt: "fix the bug in src/auth/session.ts",
      cwd: projectDir,
      apiKey: null,
    });

    const entryCount = (result!.additionalContext.match(/---/g) || []).length;
    expect(entryCount).toBeLessThanOrEqual(4);
  });
});
