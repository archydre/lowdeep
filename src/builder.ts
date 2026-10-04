import type { ZodType } from "zod";
import type z from "zod";
import type { ChatCompletionMessageParam } from "openai/resources";
import type { CallOptions, Provider, StructuredOutputMode } from "./types";

export type Compute<T> = { [K in keyof T]: T[K] } & {};

export type State = {
  hasKey: boolean;
  hasModel: boolean;
  hasOutputSchema: boolean;
  hasInputSchema: boolean;
};

export type InitialState = {
  hasKey: false;
  hasModel: false;
  hasOutputSchema: false;
  hasInputSchema: false;
};

export type LowdeepBuilder<
  S extends State,
  Output extends z.ZodType = z.ZodAny,
  Input extends z.ZodType = z.ZodAny,
> = Compute<
  {
    /** Set provider API Key. Automatically infers known providers from key prefix. */
    key(val: string): LowdeepBuilder<Omit<S, "hasKey"> & { hasKey: true }, Output, Input>;

    /** Set model name/ID. */
    model(val: string): LowdeepBuilder<Omit<S, "hasModel"> & { hasModel: true }, Output, Input>;

    /** Explicitly set or override provider. */
    provider(val: Provider): LowdeepBuilder<S, Output, Input>;

    /** Set custom OpenAI-compatible baseURL (e.g. for Ollama, vLLM, OpenRouter). */
    baseURL(url: string): LowdeepBuilder<S, Output, Input>;

    /** Set system instructions prompt. */
    system(prompt: string): LowdeepBuilder<S, Output, Input>;

    /** Set temperature between 0 and 2. */
    temperature(val: number): LowdeepBuilder<S, Output, Input>;

    /** Set maximum retries for the self-healing loop. Default is 3. */
    retry(num: number): LowdeepBuilder<S, Output, Input>;

    /** Enable or disable terminal status outputs. Disabled by default. */
    verbose(enabled?: boolean): LowdeepBuilder<S, Output, Input>;

    /** Choose structured output mode: 'auto' (native json_schema with fallback), 'strict', or 'prompt'. */
    structuredOutputMode(mode: StructuredOutputMode): LowdeepBuilder<S, Output, Input>;

    /** Preload or override conversation history. */
    use(history: ChatCompletionMessageParam[]): LowdeepBuilder<S, Output, Input>;

    /** Hook called on each attempt. */
    onAttempt(cb: (attempt: number, maxRetries: number) => void): LowdeepBuilder<S, Output, Input>;

    /** Hook called on validation error before retrying. */
    onRetry(
      cb: (error: unknown, attempt: number, maxRetries: number) => void,
    ): LowdeepBuilder<S, Output, Input>;

    /** Define output schema (and optional input schema) validated via Zod. */
    schema<NewOutput extends ZodType, NewInput extends ZodType = z.ZodAny>(
      output: NewOutput,
      input?: NewInput,
    ): LowdeepBuilder<
      Omit<S, "hasInputSchema" | "hasOutputSchema"> & {
        hasOutputSchema: true;
        hasInputSchema: NewInput extends z.ZodAny ? false : true;
      },
      NewOutput,
      NewInput
    >;

    /** Create an isolated clone of the builder with independent history. */
    clone(): LowdeepBuilder<S, Output, Input>;

    /** Retrieve a copy of the current message history. */
    getHistory(): ChatCompletionMessageParam[];

    /** Reset conversation history to empty. */
    clearHistory(): LowdeepBuilder<S, Output, Input>;
  } & (S["hasKey"] extends true
    ? S["hasModel"] extends true
      ? {
          /** Send a chat completion message and return validated output. */
          chat(
            prompt: S["hasInputSchema"] extends true ? z.infer<Input> : string | unknown,
            options?: CallOptions,
          ): Promise<S["hasOutputSchema"] extends true ? z.infer<Output> : string>;

          /** Stream the model's text response token by token. */
          chatStream(
            prompt: S["hasInputSchema"] extends true ? z.infer<Input> : string | unknown,
            options?: CallOptions,
          ): Promise<AsyncGenerator<string, void, unknown>>;
        }
      : {}
    : {})
>;

export type FinalBuilder<
  S extends State,
  Output extends z.ZodType = z.ZodAny,
  Input extends z.ZodType = z.ZodAny,
> = LowdeepBuilder<S, Output, Input>;
