import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mergeHooksIntoSettings } from "../../src/cli/commands/init.js";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("mergeHooksIntoSettings", () => {
  let projectDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    projectDir = join(tmpdir(), `kbase-init-test-${Date.now()}`);
    await mkdir(join(projectDir, ".claude"), { recursive: true });
    settingsPath = join(projectDir, ".claude", "settings.json");
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it("adds hooks to an empty settings file", async () => {
    await writeFile(settingsPath, "{}");
    const added = await mergeHooksIntoSettings(settingsPath);
    expect(added).toBe(true);

    const settings = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.Stop).toHaveLength(1);
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toContain("kb hook-read");
    expect(settings.hooks.Stop[0].hooks[0].command).toContain("kb hook-write");
  });

  it("preserves existing hooks and adds kbase hooks", async () => {
    const existing = {
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: "command", command: "my-other-hook" }] },
        ],
      },
    };
    await writeFile(settingsPath, JSON.stringify(existing));
    await mergeHooksIntoSettings(settingsPath);

    const settings = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(settings.hooks.UserPromptSubmit).toHaveLength(2);
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe("my-other-hook");
    expect(settings.hooks.UserPromptSubmit[1].hooks[0].command).toContain("kb hook-read");
  });

  it("is idempotent — skips if kbase hooks already exist", async () => {
    await writeFile(settingsPath, "{}");
    await mergeHooksIntoSettings(settingsPath);
    await mergeHooksIntoSettings(settingsPath);

    const settings = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.Stop).toHaveLength(1);
  });
});
