import { describe, it, expect } from "vitest";
import {
  extractExplicitPaths,
  buildClassifierPrompt,
} from "../../src/hooks/classifier.js";

describe("extractExplicitPaths", () => {
  it("extracts file paths from a prompt", () => {
    const paths = extractExplicitPaths(
      "fix the bug in src/auth/session.ts and check src/core/store.ts",
    );
    expect(paths).toContain("src/auth/session.ts");
    expect(paths).toContain("src/core/store.ts");
  });

  it("extracts backtick-quoted symbols", () => {
    const paths = extractExplicitPaths("what does `parseEntry` do?");
    expect(paths).toContain("parseEntry");
  });

  it("returns empty array for no matches", () => {
    expect(extractExplicitPaths("fix the login bug")).toEqual([]);
  });

  it("handles paths with directories", () => {
    const paths = extractExplicitPaths("look at src/hooks/writer.ts");
    expect(paths).toContain("src/hooks/writer.ts");
  });
});

describe("buildClassifierPrompt", () => {
  it("includes the user prompt and module list", () => {
    const prompt = buildClassifierPrompt("fix login bug", [
      "auth/session",
      "core/store",
      "mcp/server",
    ]);
    expect(prompt).toContain("fix login bug");
    expect(prompt).toContain("auth/session");
    expect(prompt).toContain("core/store");
  });

  it("returns a prompt asking for JSON array output", () => {
    const prompt = buildClassifierPrompt("test", ["mod/a"]);
    expect(prompt).toContain("JSON");
  });
});
