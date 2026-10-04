import { describe, expect, it } from "bun:test";
import lowdeep from "../src/index";
import { setClientFactory } from "../src/client";

describe("chatStream", () => {
  it("streams tokens asynchronously and records to history", async () => {
    async function* mockStreamGenerator() {
      const tokens = ["Hello", " ", "world", "!"];
      for (const t of tokens) {
        yield {
          choices: [
            {
              delta: { content: t },
            },
          ],
        };
      }
    }

    const mockOpenAIClient = {
      chat: {
        completions: {
          create: async () => mockStreamGenerator(),
        },
      },
    };

    setClientFactory(() => mockOpenAIClient as any);

    try {
      const ai = lowdeep().key("sk_mock").model("gpt-4o-mini");

      const stream = await ai.chatStream("Hi");
      const receivedTokens: string[] = [];

      for await (const token of stream) {
        receivedTokens.push(token);
      }

      expect(receivedTokens).toEqual(["Hello", " ", "world", "!"]);
      expect(ai.getHistory()).toHaveLength(2);
      expect(ai.getHistory()[1]?.content).toBe("Hello world!");
    } finally {
      setClientFactory(null);
    }
  });
});
