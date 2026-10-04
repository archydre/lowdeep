import { describe, expect, it } from "bun:test";
import { z } from "zod";
import lowdeep from "../src/index";
import { setClientFactory } from "../src/client";

describe("structured output modes and native json_schema", () => {
  it("sends response_format json_schema in auto mode", async () => {
    let capturedParams: any = null;

    const mockOpenAIClient = {
      chat: {
        completions: {
          create: async (params: any) => {
            capturedParams = params;
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: JSON.stringify({ score: 95 }),
                  },
                },
              ],
            };
          },
        },
      },
    };

    setClientFactory(() => mockOpenAIClient as any);

    try {
      const Schema = z.object({ score: z.number() });
      const ai = lowdeep()
        .key("sk_test")
        .model("gpt-4o-mini")
        .schema(Schema)
        .structuredOutputMode("auto");

      const result = await ai.chat("Evaluate code");

      expect(result).toEqual({ score: 95 });
      expect(capturedParams?.response_format?.type).toBe("json_schema");
      expect(capturedParams?.response_format?.json_schema?.name).toBe("response_output");
    } finally {
      setClientFactory(null);
    }
  });

  it("transparently falls back to prompt-based self-healing if response_format is rejected by API", async () => {
    let callAttempts = 0;
    const receivedParams: any[] = [];

    const mockOpenAIClient = {
      chat: {
        completions: {
          create: async (params: any) => {
            callAttempts++;
            receivedParams.push(params);

            if (callAttempts === 1) {
              // Simulate API rejecting response_format
              const apiError: any = new Error(
                "Invalid parameter: response_format is not supported by this model",
              );
              apiError.status = 400;
              throw apiError;
            }

            // Second call: without response_format, returning valid JSON text
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: '{"grade": "A"}',
                  },
                },
              ],
            };
          },
        },
      },
    };

    setClientFactory(() => mockOpenAIClient as any);

    try {
      const GradeSchema = z.object({ grade: z.string() });
      const ai = lowdeep()
        .key("sk_test")
        .model("legacy-model")
        .schema(GradeSchema)
        .structuredOutputMode("auto");

      const result = await ai.chat("What is my grade?");

      expect(callAttempts).toBe(2);
      expect(result).toEqual({ grade: "A" });
      // First attempt had response_format
      expect(receivedParams[0]?.response_format).toBeDefined();
      // Second attempt fell back to prompt mode without response_format
      expect(receivedParams[1]?.response_format).toBeUndefined();
    } finally {
      setClientFactory(null);
    }
  });

  it("omits response_format when mode is set to 'prompt'", async () => {
    let capturedParams: any = null;

    const mockOpenAIClient = {
      chat: {
        completions: {
          create: async (params: any) => {
            capturedParams = params;
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: JSON.stringify({ ok: true }),
                  },
                },
              ],
            };
          },
        },
      },
    };

    setClientFactory(() => mockOpenAIClient as any);

    try {
      const ai = lowdeep()
        .key("sk_test")
        .model("gpt-4o-mini")
        .schema(z.object({ ok: z.boolean() }))
        .structuredOutputMode("prompt");

      await ai.chat("ping");

      expect(capturedParams?.response_format).toBeUndefined();
    } finally {
      setClientFactory(null);
    }
  });
});
