import { describe, expect, it } from "bun:test";
import { z } from "zod";
import lowdeep, {
  LowdeepConfigurationError,
  LowdeepValidationError,
} from "../src/index";

describe("builder: configuration and validation", () => {
  it("allows setting options in flexible order", () => {
    const ai = lowdeep()
      .system("Custom system prompt")
      .temperature(0.5)
      .retry(2)
      .verbose(false)
      .key("gsk_mock_key")
      .model("llama-3.3-70b-versatile");

    expect(ai).toBeDefined();
    expect(typeof ai.chat).toBe("function");
    expect(typeof ai.chatStream).toBe("function");
  });

  it("throws LowdeepConfigurationError for invalid temperature values", () => {
    expect(() => lowdeep().temperature(2.5)).toThrow(LowdeepConfigurationError);
    expect(() => lowdeep().temperature(-0.1)).toThrow(LowdeepConfigurationError);
  });

  it("throws LowdeepConfigurationError for invalid retry values", () => {
    expect(() => lowdeep().retry(0)).toThrow(LowdeepConfigurationError);
  });

  it("manages history via use(), getHistory(), and clearHistory()", () => {
    const ai = lowdeep().use([
      { role: "system", content: "Init context" },
      { role: "user", content: "Remember Alpha" },
    ]);

    expect(ai.getHistory()).toHaveLength(2);
    expect(ai.getHistory()[1]?.content).toBe("Remember Alpha");

    ai.clearHistory();
    expect(ai.getHistory()).toHaveLength(0);
  });

  it("validates inputSchema before attempting requests", async () => {
    const InputSchema = z.object({
      age: z.number().min(18),
    });

    const ai = lowdeep()
      .key("sk_test")
      .model("gpt-4o-mini")
      .schema(z.string(), InputSchema);

    // Should throw LowdeepValidationError synchronously without reaching network
    await expect(
      ai.chat({
        age: 15, // Violates min(18)
      } as any),
    ).rejects.toThrow(LowdeepValidationError);
  });

  it("throws LowdeepConfigurationError if chat is called without key or model", async () => {
    const incomplete = lowdeep() as any;
    await expect(incomplete.chat?.("hello")).rejects.toThrow(
      LowdeepConfigurationError,
    );
  });
});
