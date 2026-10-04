import { describe, expect, it } from "bun:test";
import { getBaseURL, getOpenAIClient, inferProvider } from "../src/client";

describe("client: inferProvider and getBaseURL", () => {
  it("infers groq from gsk_ prefix", () => {
    const provider = inferProvider("gsk_test123");
    expect(provider).toBe("groq");
    expect(getBaseURL(provider)).toBe("https://api.groq.com/openai/v1");
  });

  it("infers openrouter from sk-or- prefix", () => {
    const provider = inferProvider("sk-or-v1-abcdef");
    expect(provider).toBe("openrouter");
    expect(getBaseURL(provider)).toBe("https://openrouter.ai/api/v1");
  });

  it("infers openai from sk_ and sk-proj- prefixes", () => {
    expect(inferProvider("sk_12345")).toBe("openai");
    expect(inferProvider("sk-proj-12345")).toBe("openai");
    expect(getBaseURL("openai")).toBe("https://api.openai.com/v1");
  });

  it("infers ollama from localhost baseURL", () => {
    const provider = inferProvider("test", "http://localhost:11434/v1");
    expect(provider).toBe("ollama");
  });

  it("defaults to deepinfra for unknown keys", () => {
    const provider = inferProvider("custom_key_xyz");
    expect(provider).toBe("deepinfra");
    expect(getBaseURL("deepinfra")).toBe("https://api.deepinfra.com/v1/openai");
  });

  it("honors custom baseURL when provided", () => {
    const custom = "https://custom-proxy.internal/v1";
    expect(getBaseURL("openai", custom)).toBe(custom);
  });

  it("reuses cached OpenAI client instances for identical credentials", () => {
    const c1 = getOpenAIClient({ key: "test_key", provider: "openai" });
    const c2 = getOpenAIClient({ key: "test_key", provider: "openai" });
    expect(c1).toBe(c2);
  });
});
