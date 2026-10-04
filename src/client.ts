import OpenAI from "openai";
import type { Provider } from "./types";

const clientCache = new Map<string, OpenAI>();
let customClientFactory: ((config: ClientConfig) => OpenAI) | null = null;

export const inferProvider = (key: string, baseURL?: string): Provider => {
  if (baseURL?.includes("localhost") || baseURL?.includes("127.0.0.1")) {
    return "ollama";
  }
  if (key.startsWith("gsk_")) return "groq";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("sk-proj-") || key.startsWith("sk_")) return "openai";
  if (key.startsWith("together_")) return "together";

  return "deepinfra";
};

export const getBaseURL = (provider: Provider, customBaseURL?: string): string => {
  if (customBaseURL) {
    return customBaseURL;
  }

  const p = provider.toLowerCase();
  if (p === "deepinfra") return "https://api.deepinfra.com/v1/openai";
  if (p === "groq") return "https://api.groq.com/openai/v1";
  if (p === "openai") return "https://api.openai.com/v1";
  if (p === "openrouter") return "https://openrouter.ai/api/v1";
  if (p === "together") return "https://api.together.xyz/v1";
  if (p === "ollama") return "http://localhost:11434/v1";

  return `https://api.${p}.com/openai/v1`;
};

export interface ClientConfig {
  key: string;
  provider?: Provider;
  baseURL?: string;
}

export const setClientFactory = (
  factory: ((config: ClientConfig) => OpenAI) | null,
): void => {
  customClientFactory = factory;
};

export const getOpenAIClient = (config: ClientConfig): OpenAI => {
  if (customClientFactory) {
    return customClientFactory(config);
  }

  const provider = config.provider ?? inferProvider(config.key, config.baseURL);
  const baseURL = getBaseURL(provider, config.baseURL);
  const cacheKey = `${config.key}::${baseURL}`;

  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new OpenAI({
      apiKey: config.key,
      baseURL,
    });
    clientCache.set(cacheKey, client);
  }

  return client;
};

export const clearClientCache = (): void => {
  clientCache.clear();
};
