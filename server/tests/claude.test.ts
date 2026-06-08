import { describe, expect, it } from "vitest";
import { parseJsonFromClaudeText } from "../src/ai/claude.js";

describe("parseJsonFromClaudeText", () => {
  it("parses raw JSON object", () => {
    const out = parseJsonFromClaudeText<{ company: string }>('{"company":"Acme"}');
    expect(out).toEqual({ company: "Acme" });
  });

  it("parses fenced json block", () => {
    const text = 'Here you go:\n```json\n{"title":"Engineer"}\n```';
    expect(parseJsonFromClaudeText<{ title: string }>(text)).toEqual({ title: "Engineer" });
  });

  it("extracts object from surrounding prose", () => {
    const text = 'Note: {"company":"Beta", "title":"PM"} is the draft.';
    expect(parseJsonFromClaudeText<{ company: string; title: string }>(text)).toEqual({
      company: "Beta",
      title: "PM",
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseJsonFromClaudeText("not json")).toBeNull();
  });
});
