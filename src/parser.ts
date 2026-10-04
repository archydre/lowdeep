import type z from "zod";
import { LowdeepValidationError } from "./errors";

/**
 * Remove reasoning tags (e.g. <think>...</think>) and extract fenced code blocks if present.
 */
export const stripReasoningAndMarkdown = (content: string): string => {
  // Strip <think>...</think> tags (common in reasoning models like DeepSeek-R1)
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // If content contains fenced markdown code blocks, try extracting the JSON block
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  const matches = [...cleaned.matchAll(jsonBlockRegex)];

  if (matches.length > 0) {
    // Prefer the first non-empty markdown block
    const blockContent = matches.find((m) => m[1]?.trim().length)?.at(1);
    if (blockContent) {
      cleaned = blockContent.trim();
    }
  }

  return cleaned;
};

/**
 * Finds the first balanced JSON object or array starting at fromIndex.
 * Correctly accounts for escaped quotes, escaped backslashes, and string boundaries.
 */
export const findBalancedJson = (text: string, fromIndex: number): string | null => {
  const startChar = text[fromIndex];
  if (startChar !== "{" && startChar !== "[") return null;

  const stack: string[] = [startChar];
  let inString = false;

  for (let i = fromIndex + 1; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (ch === '"') {
        // Count consecutive backslashes right before this quote
        let backslashCount = 0;
        let p = i - 1;
        while (p >= 0 && text[p] === "\\") {
          backslashCount++;
          p--;
        }
        // If even number of backslashes (including 0), the quote is NOT escaped
        if (backslashCount % 2 === 0) {
          inString = false;
        }
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }

    if (ch === "}" || ch === "]") {
      const last = stack.at(-1);
      const closesObject = ch === "}" && last === "{";
      const closesArray = ch === "]" && last === "[";

      if (!closesObject && !closesArray) return null;
      stack.pop();
      if (stack.length === 0) return text.slice(fromIndex, i + 1);
    }
  }

  return null;
};

/**
 * Strips comments and trailing commas to be resilient to LLM output quirks.
 */
const sanitizeJsonSyntax = (raw: string): string => {
  return raw
    // Remove single line comments // ...
    .replace(/(^|[^\\:])\/\/.*$/gm, "$1")
    // Remove trailing commas in objects or arrays: , } or , ]
    .replace(/,\s*([}\]])/g, "$1");
};

/**
 * Parses JSON loosely from model output with fallback block scanning.
 */
export const parseJsonLoose = (content: string): unknown => {
  if (!content || !content.trim()) {
    throw new LowdeepValidationError("Empty response received from model.");
  }

  const cleaned = stripReasoningAndMarkdown(content);
  if (!cleaned) {
    throw new LowdeepValidationError("Empty response after stripping reasoning tags.");
  }

  // 1. Direct parse attempt
  try {
    return JSON.parse(cleaned);
  } catch {
    // 2. Direct parse with trailing comma/comments cleanup
    try {
      return JSON.parse(sanitizeJsonSyntax(cleaned));
    } catch {
      // Continue to balanced extraction
    }
  }

  // 3. Scan for balanced JSON blocks
  const parsedValues: unknown[] = [];
  let i = 0;

  while (i < cleaned.length) {
    const nextObject = cleaned.indexOf("{", i);
    const nextArray = cleaned.indexOf("[", i);
    const starts = [nextObject, nextArray].filter((idx) => idx >= 0);
    if (starts.length === 0) break;

    const start = Math.min(...starts);
    const block = findBalancedJson(cleaned, start);
    if (!block) {
      i = start + 1;
      continue;
    }

    try {
      parsedValues.push(JSON.parse(block));
    } catch {
      try {
        parsedValues.push(JSON.parse(sanitizeJsonSyntax(block)));
      } catch {
        // Ignore unparseable snippet
      }
    }
    i = start + block.length;
  }

  if (parsedValues.length === 0) {
    throw new LowdeepValidationError("No valid JSON found in the model response.");
  }

  return parsedValues.length === 1 ? parsedValues[0] : parsedValues;
};

/**
 * Helper to derive root type hint for prompts.
 */
export const getSchemaRootHint = (schema?: z.ZodType | null): string => {
  if (!schema) return "JSON";
  try {
    const jsonSchema = schema.toJSONSchema() as { type?: string | string[] };
    const schemaType = jsonSchema?.type;

    if (schemaType === "array" || (Array.isArray(schemaType) && schemaType.includes("array"))) {
      return "square brackets []";
    }

    if (schemaType === "object" || (Array.isArray(schemaType) && schemaType.includes("object"))) {
      return "curly braces {}";
    }
  } catch {
    // Fallback if schema does not support toJSONSchema directly
  }

  return "the exact root type required by the JSON schema";
};
