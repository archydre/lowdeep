import z from "zod";
import type { ChatCompletionMessageParam } from "openai/resources";
import type { FinalBuilder, InitialState, LowdeepBuilder } from "./builder";
import type { CallOptions, LowdeepOptions, Provider, StructuredOutputMode } from "./types";
import { getOpenAIClient, inferProvider } from "./client";
import { getSchemaRootHint, parseJsonLoose } from "./parser";
import {
  LowdeepConfigurationError,
  LowdeepError,
  LowdeepMaxRetriesError,
  LowdeepValidationError,
} from "./errors";

export * from "./errors";
export * from "./types";
export type { FinalBuilder, LowdeepBuilder } from "./builder";

function createBuilder<
  S extends {
    hasKey: boolean;
    hasModel: boolean;
    hasOutputSchema: boolean;
    hasInputSchema: boolean;
  },
  Output extends z.ZodType = z.ZodAny,
  Input extends z.ZodType = z.ZodAny,
>(options: LowdeepOptions = {}): LowdeepBuilder<S, Output, Input> {
  const _history: ChatCompletionMessageParam[] = options.history ? [...options.history] : [];
  const _system: string = options.system ?? "Be a helpful assistant";
  const _key: string | undefined = options.key;
  const _provider: Provider | undefined = options.provider;
  const _baseURL: string | undefined = options.baseURL;
  const _model: string | undefined = options.model;
  const _nRetry: number = options.retry ?? 3;
  const _temperature: number = options.temperature ?? 0.7;
  const _verbose: boolean = options.verbose ?? false;
  const _structuredOutputMode: StructuredOutputMode = options.structuredOutputMode ?? "auto";
  const _schema: z.ZodType | null = options.outputSchema ?? null;
  const _inputSchema: z.ZodType | null = options.inputSchema ?? null;
  const _hooks = { ...options.hooks };

  const builder: any = {
    key(val: string) {
      return createBuilder({
        ...options,
        history: [..._history],
        key: val,
        provider: _provider ?? inferProvider(val, _baseURL),
      });
    },

    model(val: string) {
      return createBuilder({
        ...options,
        history: [..._history],
        model: val,
      });
    },

    provider(val: Provider) {
      return createBuilder({
        ...options,
        history: [..._history],
        provider: val,
      });
    },

    baseURL(url: string) {
      return createBuilder({
        ...options,
        history: [..._history],
        baseURL: url,
      });
    },

    system(prompt: string) {
      return createBuilder({
        ...options,
        history: [..._history],
        system: prompt,
      });
    },

    temperature(val: number) {
      if (val > 2 || val < 0) {
        throw new LowdeepConfigurationError("Temperatures must be a value between 0 and 2.");
      }
      return createBuilder({
        ...options,
        history: [..._history],
        temperature: val,
      });
    },

    retry(val: number) {
      if (val < 1) {
        throw new LowdeepConfigurationError("Retry count must be at least 1.");
      }
      return createBuilder({
        ...options,
        history: [..._history],
        retry: val,
      });
    },

    verbose(enabled: boolean = true) {
      return createBuilder({
        ...options,
        history: [..._history],
        verbose: enabled,
      });
    },

    structuredOutputMode(mode: StructuredOutputMode) {
      return createBuilder({
        ...options,
        history: [..._history],
        structuredOutputMode: mode,
      });
    },

    use(history: ChatCompletionMessageParam[]) {
      _history.length = 0;
      _history.push(...history);
      return createBuilder({
        ...options,
        history: [...history],
      });
    },

    onAttempt(cb: (attempt: number, maxRetries: number) => void) {
      return createBuilder({
        ...options,
        history: [..._history],
        hooks: { ..._hooks, onAttempt: cb },
      });
    },

    onRetry(cb: (error: unknown, attempt: number, maxRetries: number) => void) {
      return createBuilder({
        ...options,
        history: [..._history],
        hooks: { ..._hooks, onRetry: cb },
      });
    },

    schema(output: z.ZodType, input?: z.ZodType) {
      return createBuilder({
        ...options,
        history: [..._history],
        outputSchema: output,
        inputSchema: input ?? _inputSchema,
      });
    },

    clone() {
      return createBuilder({
        ...options,
        history: [..._history],
      });
    },

    getHistory() {
      return [..._history];
    },

    clearHistory() {
      _history.length = 0;
      return createBuilder({
        ...options,
        history: [],
      });
    },

    async chat(data: any, callOptions?: CallOptions) {
      if (!_key || !_model) {
        throw new LowdeepConfigurationError(
          "Both API key and model must be specified before calling chat().",
        );
      }

      const client = getOpenAIClient({
        key: _key,
        provider: _provider,
        baseURL: _baseURL,
      });

      let promptContent: string;

      if (_inputSchema) {
        const parseResult = _inputSchema.safeParse(data);
        if (!parseResult.success) {
          const formatted = z.treeifyError(parseResult.error);
          throw new LowdeepValidationError(
            `Input validation failed: ${JSON.stringify(formatted)}`,
            parseResult.error,
          );
        }
        promptContent = JSON.stringify(parseResult.data);
      } else {
        promptContent = typeof data === "string" ? data : JSON.stringify(data);
      }

      const userMessage: ChatCompletionMessageParam = {
        role: "user",
        content: promptContent,
      };

      const rootHint = getSchemaRootHint(_schema);
      const systemContent = `
${_system}
${
  _schema
    ? `
You MUST return only a single valid JSON payload (pure JSON, no markdown, no comments, no <think> tags).
The response root must use ${rootHint}.
Follow this schema strictly:
${JSON.stringify(_schema.toJSONSchema())}
`
    : _inputSchema
      ? `
Expect the exact schema below and use it to follow the given instructions:
${JSON.stringify(_inputSchema.toJSONSchema())}
`
      : ""
}
`.trim();

      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: systemContent,
        },
        ..._history,
        userMessage,
      ];

      const requestOptions: Record<string, any> = {};
      if (callOptions?.signal) requestOptions.signal = callOptions.signal;
      if (callOptions?.headers) requestOptions.headers = callOptions.headers;
      if (callOptions?.timeoutMs !== undefined) requestOptions.timeout = callOptions.timeoutMs;

      let lastContent: string | null = null;
      let lastError: unknown = null;
      let useNativeStructuredOutput = _structuredOutputMode !== "prompt" && _schema !== null;

      for (let attempt = 1; attempt <= _nRetry; attempt++) {
        _hooks.onAttempt?.(attempt, _nRetry);

        if (_verbose && typeof process !== "undefined" && process.stdout?.write) {
          process.stdout.write(`[lowdeep] Attempt ${attempt}/${_nRetry}...\n`);
        }

        let response: any;
        try {
          const completionParams: any = {
            messages,
            model: _model,
            temperature: _temperature,
          };

          if (useNativeStructuredOutput && _schema) {
            completionParams.response_format = {
              type: "json_schema",
              json_schema: {
                name: "response_output",
                strict: true,
                schema: _schema.toJSONSchema(),
              },
            };
          }

          response = await client.chat.completions.create(completionParams, requestOptions);
        } catch (apiError: any) {
          // If native structured output failed and we are in auto mode, fallback to prompt-only
          if (
            useNativeStructuredOutput &&
            _structuredOutputMode === "auto" &&
            (apiError?.status === 400 || apiError?.message?.includes("response_format"))
          ) {
            useNativeStructuredOutput = false;
            // Retry this attempt without response_format
            const fallbackParams: any = {
              messages,
              model: _model,
              temperature: _temperature,
            };
            response = await client.chat.completions.create(fallbackParams, requestOptions);
          } else {
            throw apiError;
          }
        }

        const aiMsg = response.choices[0]?.message;
        lastContent = aiMsg?.content ?? null;

        if (!_schema) {
          _history.push(userMessage);
          _history.push({
            role: "assistant",
            content: aiMsg?.content ?? "",
          });

          return aiMsg?.content ?? "";
        }

        try {
          const jsonRaw = parseJsonLoose(aiMsg?.content || "");
          const result = _schema.safeParse(jsonRaw);

          if (result.success) {
            _history.push(userMessage);
            _history.push({
              role: "assistant",
              content: aiMsg?.content ?? JSON.stringify(result.data),
            });

            return result.data;
          }

          lastError = result.error;
          const formattedError = z.treeifyError(result.error);
          _hooks.onRetry?.(result.error, attempt, _nRetry);

          if (aiMsg) {
            messages.push(aiMsg as ChatCompletionMessageParam);
          }
          messages.push({
            role: "user",
            content: `Your last JSON response was invalid.
Errors: ${JSON.stringify(formattedError)}.
Please fix the JSON and return only the corrected JSON.`,
          });
        } catch (error: any) {
          lastError = error;
          _hooks.onRetry?.(error, attempt, _nRetry);

          if (aiMsg) {
            messages.push(aiMsg as ChatCompletionMessageParam);
          }
          messages.push({
            role: "user",
            content: `Your last JSON response was invalid.
Errors: ${JSON.stringify(error.message ?? error)}.
Please fix the JSON and return only the corrected JSON.`,
          });
        }
      }

      throw new LowdeepMaxRetriesError(
        `Failed to obtain a valid response after ${_nRetry} attempts.`,
        _nRetry,
        lastContent,
        lastError,
      );
    },

    async chatStream(data: any, callOptions?: CallOptions) {
      if (!_key || !_model) {
        throw new LowdeepConfigurationError(
          "Both API key and model must be specified before calling chatStream().",
        );
      }

      const client = getOpenAIClient({
        key: _key,
        provider: _provider,
        baseURL: _baseURL,
      });

      let promptContent: string;
      if (_inputSchema) {
        const parseResult = _inputSchema.safeParse(data);
        if (!parseResult.success) {
          const formatted = z.treeifyError(parseResult.error);
          throw new LowdeepValidationError(
            `Input validation failed: ${JSON.stringify(formatted)}`,
            parseResult.error,
          );
        }
        promptContent = JSON.stringify(parseResult.data);
      } else {
        promptContent = typeof data === "string" ? data : JSON.stringify(data);
      }

      const userMessage: ChatCompletionMessageParam = {
        role: "user",
        content: promptContent,
      };

      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: _system,
        },
        ..._history,
        userMessage,
      ];

      const requestOptions: Record<string, any> = {};
      if (callOptions?.signal) requestOptions.signal = callOptions.signal;
      if (callOptions?.headers) requestOptions.headers = callOptions.headers;
      if (callOptions?.timeoutMs !== undefined) requestOptions.timeout = callOptions.timeoutMs;

      const stream = await client.chat.completions.create(
        {
          messages,
          model: _model,
          temperature: _temperature,
          stream: true,
        },
        requestOptions,
      );

      async function* generateStream() {
        let accumulated = "";
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content || "";
          if (token) {
            accumulated += token;
            yield token;
          }
        }
        _history.push(userMessage);
        _history.push({
          role: "assistant",
          content: accumulated,
        });
      }

      return generateStream();
    },
  };

  return builder as LowdeepBuilder<S, Output, Input>;
}

export default function lowdeep(options?: LowdeepOptions): FinalBuilder<InitialState> {
  return createBuilder<InitialState>(options);
}

export { lowdeep };
