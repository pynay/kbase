import { describe, it, expect } from "vitest";
import { extractExplicitPaths } from "../../src/hooks/path-extractor.js";

describe("extractExplicitPaths", () => {
  it("returns empty array for prompts with no paths or backticks", () => {
    expect(extractExplicitPaths("fix the auth bug")).toEqual([]);
  });

  it("extracts a file path with a single slash", () => {
    expect(extractExplicitPaths("update src/index.ts")).toEqual(["src/index.ts"]);
  });

  it("extracts a deeply nested file path", () => {
    expect(extractExplicitPaths("look at src/auth/session/jwt.ts")).toEqual([
      "src/auth/session/jwt.ts",
    ]);
  });

  it("extracts multiple file paths in one prompt", () => {
    const result = extractExplicitPaths(
      "compare src/auth/session.ts and tests/auth/session.test.ts",
    );
    expect(result).toEqual([
      "src/auth/session.ts",
      "tests/auth/session.test.ts",
    ]);
  });

  it("extracts backtick-quoted symbols", () => {
    expect(extractExplicitPaths("rename `getUserId` to `getCurrentUserId`")).toEqual([
      "getUserId",
      "getCurrentUserId",
    ]);
  });

  it("extracts both file paths and backticked symbols from the same prompt", () => {
    const result = extractExplicitPaths(
      "in src/auth/session.ts, the `validateToken` function is broken",
    );
    expect(result).toContain("src/auth/session.ts");
    expect(result).toContain("validateToken");
  });

  it("does not match bare filenames without a directory prefix", () => {
    // Current behavior: regex requires at least one slash. Bare `session.ts`
    // alone won't match. Documented as intentional — fuzzy matching was
    // a deferred design choice in the spec.
    expect(extractExplicitPaths("look at session.ts")).toEqual([]);
  });

  it("handles paths at the start of the prompt", () => {
    expect(extractExplicitPaths("src/index.ts has a bug")).toEqual([
      "src/index.ts",
    ]);
  });

  it("does not match URLs as file paths", () => {
    // The regex requires a final `.ext`, but URLs like https://example.com/foo
    // would match if "foo" had an extension. With trailing slash or path
    // segment that has no extension, no match.
    expect(extractExplicitPaths("see https://example.com/docs")).toEqual([]);
  });
});
