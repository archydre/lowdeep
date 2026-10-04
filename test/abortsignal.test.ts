import { describe, expect, it } from "bun:test";
import lowdeep from "../src/index";
import { setClientFactory } from "../src/client";

describe("CallOptions and AbortSignal support", () => {
  it("forwards AbortSignal and aborts execution when signal is triggered", async () => {
    const controller = new AbortController();

    const mockOpenAIClient = {
      chat: {
        completions: {
          create: async (_params: any, options?: any) => {
            if (options?.signal?.aborted) {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              throw err;
            }

            return new Promise((_resolve, reject) => {
              options?.signal?.addEventListener("abort", () => {
                const err = new Error("The operation was aborted");
                err.name = "AbortError";
                reject(err);
              });
            });
          },
        },
      },
    };

    setClientFactory(() => mockOpenAIClient as any);

    try {
      const ai = lowdeep().key("sk_test").model("gpt-4o-mini");

      const chatPromise = ai.chat("Long prompt", { signal: controller.signal });

      // Trigger abort immediately
      controller.abort();

      await expect(chatPromise).rejects.toThrow("The operation was aborted");
    } finally {
      setClientFactory(null);
    }
  });

  it("forwards custom headers and timeoutMs", async () => {
    let capturedOptions: any = null;

    const mockOpenAIClient = {
      chat: {
        completions: {
          create: async (_params: any, options?: any) => {
            capturedOptions = options;
            return {
              choices: [{ message: { role: "assistant", content: "OK" } }],
            };
          },
        },
      },
    };

    setClientFactory(() => mockOpenAIClient as any);

    try {
      const ai = lowdeep().key("sk_test").model("gpt-4o-mini");

      await ai.chat("Hi", {
        timeoutMs: 5000,
        headers: { "X-Custom-Client": "Lowdeep-Test" },
      });

      expect(capturedOptions?.timeout).toBe(5000);
      expect(capturedOptions?.headers?.["X-Custom-Client"]).toBe("Lowdeep-Test");
    } finally {
      setClientFactory(null);
    }
  });
});
