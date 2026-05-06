import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseTranscriptTail,
  hasToolCalls,
  TranscriptMessage,
} from "../../src/hooks/transcript.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("parseTranscriptTail", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `kbase-transcript-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    filePath = join(dir, "transcript.jsonl");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns the last user and assistant messages", async () => {
    const lines = [
      JSON.stringify({ role: "user", content: "first question" }),
      JSON.stringify({ role: "assistant", content: "first answer", tool_calls: [] }),
      JSON.stringify({ role: "user", content: "second question" }),
      JSON.stringify({
        role: "assistant",
        content: "second answer",
        tool_calls: [{ name: "Edit", input: {} }],
      }),
    ];
    await writeFile(filePath, lines.join("\n") + "\n");

    const tail = await parseTranscriptTail(filePath);
    expect(tail.userPrompt).toBe("second question");
    expect(tail.assistantContent).toContain("second answer");
  });

  it("returns empty strings for an empty transcript", async () => {
    await writeFile(filePath, "");
    const tail = await parseTranscriptTail(filePath);
    expect(tail.userPrompt).toBe("");
    expect(tail.assistantContent).toBe("");
    expect(tail.toolNames).toEqual([]);
  });
});

describe("hasToolCalls", () => {
  it("returns true when edit-class tools are present", () => {
    expect(hasToolCalls(["Edit", "Read"])).toBe(true);
    expect(hasToolCalls(["Write"])).toBe(true);
    expect(hasToolCalls(["Bash"])).toBe(true);
  });

  it("returns false for read-only tools", () => {
    expect(hasToolCalls(["Read", "Glob", "Grep"])).toBe(false);
  });

  it("returns false for empty list", () => {
    expect(hasToolCalls([])).toBe(false);
  });
});
