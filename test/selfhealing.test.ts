import { describe, expect, it } from "bun:test";
import { z } from "zod";
import lowdeep, { LowdeepMaxRetriesError } from "../src/index";
import { setClientFactory } from "../src/client";

describe("self-healing loop with mock client", () => {
  it("heals invalid output on second attempt using Zod feedback", async () => {
    let callCount = 0;
    const retryCalls: number[] = [];
    const attemptCalls: number[] = [];

    const mockOpenAIClient = {
      chat: {
        completions: {
          create: async (params: any) => {
            callCount++;
            if (callCount === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: JSON.stringify({ name: "Alice", age: 12 }),
                    },
                  },
                ],
              };
            }

            const lastMsg = params.messages.at(-1);
            expect(lastMsg?.content).toContain("Your last JSON response was invalid");

            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: JSON.stringify({ name: "Alice", age: 24 }),
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
      const UserSchema = z.object({
        name: z.string(),
        age: z.number().min(18),
      });

      const ai = lowdeep()
        .key("sk_mock")
        .model("gpt-4o-mini")
        .schema(UserSchema)
        .retry(3)
        .onAttempt((attempt, max) => attemptCalls.push(attempt))
        .onRetry((_err, attempt) => retryCalls.push(attempt));

      const result = await ai.chat("Generate user profile");

      expect(callCount).toBe(2);
      expect(result).toEqual({ name: "Alice", age: 24 });
      expect(attemptCalls).toEqual([1, 2]);
      expect(retryCalls).toEqual([1]);
    } finally {
      setClientFactory(null);
    }
  });

  it("throws LowdeepMaxRetriesError when all retries are exhausted", async () => {
    const mockOpenAIClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "I am unable to output JSON",
                },
              },
            ],
          }),
        },
      },
    };

    setClientFactory(() => mockOpenAIClient as any);

    try {
      const ai = lowdeep()
        .key("sk_mock")
        .model("gpt-4o-mini")
        .schema(z.object({ answer: z.string() }))
        .retry(2);

      await expect(ai.chat("Answer")).rejects.toThrow(LowdeepMaxRetriesError);
    } finally {
      setClientFactory(null);
    }
  });
});
