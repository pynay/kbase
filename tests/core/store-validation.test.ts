import { describe, it, expect } from "vitest";
import { validateDecisionLength } from "../../src/core/store.js";

describe("validateDecisionLength", () => {
  it("passes for decisions at or above minimum length", () => {
    const decision = "A".repeat(80);
    expect(() => validateDecisionLength(decision, 80)).not.toThrow();
  });

  it("throws for decisions below minimum length", () => {
    expect(() => validateDecisionLength("Too short", 80)).toThrow(
      /decision must be at least 80 characters/,
    );
  });

  it("uses default minimum of 80 when not specified", () => {
    expect(() => validateDecisionLength("Too short")).toThrow();
    expect(() =>
      validateDecisionLength("A".repeat(80)),
    ).not.toThrow();
  });
});
