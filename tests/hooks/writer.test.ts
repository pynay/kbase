import { describe, it, expect } from "vitest";
import { buildWriterSystemPrompt, buildWriterTools } from "../../src/hooks/writer.js";

describe("buildWriterSystemPrompt", () => {
  it("contains the empty-output instruction", () => {
    const prompt = buildWriterSystemPrompt();
    expect(prompt).toContain("RETURNING NOTHING IS THE CORRECT ANSWER MOST OF THE TIME");
  });

  it("contains dedupe instructions", () => {
    const prompt = buildWriterSystemPrompt();
    expect(prompt).toContain("read_knowledge");
    expect(prompt).toContain("duplicate");
  });

  it("contains the quality criteria", () => {
    const prompt = buildWriterSystemPrompt();
    expect(prompt).toContain("non-obvious choice");
    expect(prompt).toContain("assumption baked into the code");
  });
});

describe("buildWriterTools", () => {
  it("exposes exactly two tools", () => {
    const tools = buildWriterTools();
    expect(tools).toHaveLength(2);
    const names = tools.map((t) => t.name);
    expect(names).toContain("read_knowledge");
    expect(names).toContain("write_knowledge");
  });

  it("write_knowledge requires module, summary, decision, files", () => {
    const tools = buildWriterTools();
    const writeTool = tools.find((t) => t.name === "write_knowledge")!;
    const required = writeTool.input_schema.required as string[];
    expect(required).toContain("module");
    expect(required).toContain("summary");
    expect(required).toContain("decision");
    expect(required).toContain("files");
  });
});
