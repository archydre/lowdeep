import type { ChatCompletionMessageParam } from "openai/resources";
import type { ZodType } from "zod";

export type KnownProvider =
  | "openai"
  | "groq"
  | "deepinfra"
  | "openrouter"
  | "together"
  | "ollama"
  | "custom";

export type Provider = KnownProvider | (string & {});

export type StructuredOutputMode = "auto" | "strict" | "prompt";

export interface LifecycleHooks {
  onAttempt?: (attempt: number, maxRetries: number) => void;
  onRetry?: (error: unknown, attempt: number, maxRetries: number) => void;
  onError?: (error: unknown) => void;
}

export interface CallOptions {
  /** Optional AbortSignal to cancel requests and self-healing retries. */
  signal?: AbortSignal;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Custom HTTP headers forwarded to the provider. */
  headers?: Record<string, string>;
}

export interface LowdeepOptions {
  key?: string;
  provider?: Provider;
  baseURL?: string;
  model?: string;
  system?: string;
  temperature?: number;
  retry?: number;
  verbose?: boolean;
  structuredOutputMode?: StructuredOutputMode;
  history?: ChatCompletionMessageParam[];
  outputSchema?: ZodType | null;
  inputSchema?: ZodType | null;
  hooks?: LifecycleHooks;
}
