import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  findBalancedJson,
  getSchemaRootHint,
  parseJsonLoose,
  stripReasoningAndMarkdown,
} from "../src/parser";
import { LowdeepValidationError } from "../src/errors";

describe("parser: stripReasoningAndMarkdown", () => {
  it("removes <think> tags from reasoning models", () => {
    const raw = "<think>Let me ponder about the user query...</think>{\"answer\": 42}";
    const cleaned = stripReasoningAndMarkdown(raw);
    expect(cleaned).toBe('{"answer": 42}');
  });

  it("extracts json from markdown fences", () => {
    const raw = "Here is your JSON:\n```json\n{\n  \"status\": \"ok\"\n}\n```\nHope it helps!";
    const cleaned = stripReasoningAndMarkdown(raw);
    expect(cleaned).toBe('{\n  "status": "ok"\n}');
  });

  it("handles empty or plain text without errors", () => {
    expect(stripReasoningAndMarkdown("hello world")).toBe("hello world");
  });
});

describe("parser: findBalancedJson", () => {
  it("finds a simple balanced object", () => {
    const text = 'prefix {"a": 1} suffix';
    const start = text.indexOf("{");
    const result = findBalancedJson(text, start);
    expect(result).toBe('{"a": 1}');
  });

  it("finds a balanced array", () => {
    const text = "items: [1, 2, [3, 4]] done";
    const start = text.indexOf("[");
    const result = findBalancedJson(text, start);
    expect(result).toBe("[1, 2, [3, 4]]");
  });

  it("handles escaped quotes correctly", () => {
    const text = '{"quote": "She said: \\"Hello!\\""}';
    const result = findBalancedJson(text, 0);
    expect(result).toBe('{"quote": "She said: \\"Hello!\\""}');
  });

  it("handles double backslashes followed by quote", () => {
    // String in JSON: "path\\\\" where \\ is escaped backslash, quote is closing
    const text = '{"path": "C:\\\\"}';
    const result = findBalancedJson(text, 0);
    expect(result).toBe('{"path": "C:\\\\"}');
  });

  it("returns null for unbalanced json", () => {
    const text = '{"unfinished": 1';
    const result = findBalancedJson(text, 0);
    expect(result).toBeNull();
  });
});

describe("parser: parseJsonLoose", () => {
  it("parses direct JSON", () => {
    const res = parseJsonLoose('{"name": "Lowdeep"}');
    expect(res).toEqual({ name: "Lowdeep" });
  });

  it("parses JSON inside markdown blocks with text around it", () => {
    const content = `
Sure! Here is the requested data:
\`\`\`json
{
  "count": 10,
  "items": ["apple", "banana"]
}
\`\`\`
Let me know if you need more.
    `;
    const res = parseJsonLoose(content);
    expect(res).toEqual({ count: 10, items: ["apple", "banana"] });
  });

  it("parses JSON with trailing commas", () => {
    const content = '{"name": "test", "tags": [1, 2, ], }';
    const res = parseJsonLoose(content);
    expect(res).toEqual({ name: "test", tags: [1, 2] });
  });

  it("throws LowdeepValidationError on completely invalid content", () => {
    expect(() => parseJsonLoose("just plain words")).toThrow(LowdeepValidationError);
  });
});

describe("parser: getSchemaRootHint", () => {
  it("identifies array schemas", () => {
    const schema = z.array(z.string());
    expect(getSchemaRootHint(schema)).toBe("square brackets []");
  });

  it("identifies object schemas", () => {
    const schema = z.object({ id: z.number() });
    expect(getSchemaRootHint(schema)).toBe("curly braces {}");
  });
});
