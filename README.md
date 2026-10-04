# Lowdeep

Fluent, resilient, type-safe AI SDK for OpenAI-compatible chat models.

Lowdeep helps you move from free-form model output to validated TypeScript objects. It uses Zod for runtime validation and retries automatically when responses do not match your schema.

[![CI](https://github.com/archydre/lowdeep/actions/workflows/ci.yml/badge.svg)](https://github.com/archydre/lowdeep/actions/workflows/ci.yml)
[![Sponsor Lowdeep](https://img.shields.io/badge/Sponsor-Lowdeep-ff69b4?style=for-the-badge&logo=github-sponsors)](https://github.com/sponsors/archydre)

## Table of Contents

- [Why Lowdeep](#why-lowdeep)
- [Installation](#installation)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Detailed Examples](#detailed-examples)
- [How the Builder Works](#how-the-builder-works)
- [API Reference](#api-reference)
- [Self-Healing JSON Flow](#self-healing-json-flow)
- [Provider Behavior](#provider-behavior)
- [Error Handling](#error-handling)
- [Development](#development)
- [Security Notes](#security-notes)
- [License](#license)

## Why Lowdeep

- Fluent builder API: `lowdeep().key(...).model(...).chat(...)`
- Type-gated usage: `chat()` is only available after required setup
- Zod output validation with inferred TypeScript return types
- Optional Zod input validation before making provider requests
- Retry-on-validation-error loop with feedback sent back to the model
- Built-in conversation memory, plus custom history injection

## Installation

```bash
bun add lowdeep zod
# or
npm install lowdeep zod
```

## Requirements

- Node.js or Bun
- TypeScript `>=5`
- API key for one of the supported providers

## Quick Start

```ts
import lowdeep from "lowdeep";

const ai = lowdeep()
  .key(process.env.OPENAI_API_KEY!)
  .model("gpt-4o-mini")
  .system("Be practical and concise.")
  .temperature(0.4);

const answer = await ai.chat("Explain what an API is in one paragraph.");
console.log(answer);
```

## Detailed Examples

### Example 1: Simple text chat

Use this when you only need plain text and do not need schema validation.

```ts
import lowdeep from "lowdeep";

const ai = lowdeep()
  .key(process.env.GROQ_API_KEY!)
  .model("llama-3.3-70b-versatile")
  .retry(2);

const tips = await ai.chat("Give me 5 ways to learn TypeScript faster.");
console.log(tips);
```

### Example 2: Structured output (output schema only)

Use output schema when you need deterministic object shapes.

```ts
import { z } from "zod";
import lowdeep from "lowdeep";

const PlanSchema = z.object({
  topic: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  steps: z.array(
    z.object({
      title: z.string(),
      estimateMinutes: z.number().int().min(1),
    }),
  ),
});

const ai = lowdeep()
  .key(process.env.OPENAI_API_KEY!)
  .model("gpt-4o-mini")
  .schema(PlanSchema)
  .retry(3);

const plan = await ai.chat("Create a React hooks study plan for beginners.");

// typed values from z.infer<typeof PlanSchema>
console.log(plan.topic);
console.log(plan.steps[0]?.title);
```

### Example 3: Input + output schemas

Use this when your input is also structured and must be validated before request.

```ts
import { z } from "zod";
import lowdeep from "lowdeep";

const InputSchema = z.object({
  productName: z.string().min(2),
  audience: z.enum(["developer", "manager", "founder"]),
  tone: z.enum(["serious", "friendly"]),
});

const OutputSchema = z.object({
  headline: z.string(),
  bullets: z.array(z.string()).length(3),
  cta: z.string(),
});

const ai = lowdeep()
  .key(process.env.OPENAI_API_KEY!)
  .model("gpt-4o-mini")
  .schema(OutputSchema, InputSchema)
  .system("Return concise marketing copy.");

const ad = await ai.chat({
  productName: "Lowdeep",
  audience: "developer",
  tone: "friendly",
});

console.log(ad.headline);
console.log(ad.bullets);
console.log(ad.cta);
```

If input does not match `InputSchema`, `chat(...)` throws immediately and no request is sent.

### Example 4: Multi-turn memory

Lowdeep keeps conversation history in memory for the builder instance.

```ts
import lowdeep from "lowdeep";

const ai = lowdeep()
  .key(process.env.OPENAI_API_KEY!)
  .model("gpt-4o-mini");

await ai.chat("Remember this code: PX-19.");
const reply = await ai.chat("What code did I ask you to remember?");
console.log(reply);
```

### Example 5: Injecting your own history

Use `.use(...)` to preload context from your application state.

```ts
import lowdeep from "lowdeep";
import type { ChatCompletionMessageParam } from "openai/resources";

const history: ChatCompletionMessageParam[] = [
  { role: "system", content: "You are a strict project assistant." },
  { role: "user", content: "Project codename is Atlas." },
];

const ai = lowdeep()
  .use(history)
  .key(process.env.OPENAI_API_KEY!)
  .model("gpt-4o-mini");

console.log(await ai.chat("What is the project codename?"));
```

### Example 6: Streaming responses token-by-token

Use `.chatStream(...)` for real-time text streaming in chat applications or CLI tools.

```ts
import lowdeep from "lowdeep";

const ai = lowdeep()
  .key(process.env.OPENAI_API_KEY!)
  .model("gpt-4o-mini");

const stream = await ai.chatStream("Write a haiku about clean code.");

for await (const token of stream) {
  process.stdout.write(token);
}
```

### Example 7: Local models with Ollama or custom baseURL

Connect to Ollama, vLLM, LocalAI, or corporate proxies with `.baseURL(...)`.

```ts
import lowdeep from "lowdeep";

const ai = lowdeep()
  .baseURL("http://localhost:11434/v1")
  .key("ollama")
  .model("llama3.2");

const reply = await ai.chat("Hello from local Ollama!");
console.log(reply);
```

### Example 8: Lifecycle hooks & telemetry

Track attempts and catch self-healing retries in production logging.

```ts
import lowdeep from "lowdeep";
import { z } from "zod";

const ai = lowdeep()
  .key(process.env.GROQ_API_KEY!)
  .model("llama-3.3-70b-versatile")
  .schema(z.object({ status: z.literal("success") }))
  .onAttempt((attempt, max) => {
    console.log(`[Attempt ${attempt}/${max}]`);
  })
  .onRetry((error, attempt, max) => {
    console.warn(`[Retry ${attempt}/${max}] Schema failed, requesting healing:`, error);
  });

const data = await ai.chat("Return status success");
```

### Example 9: Request cancellation with `AbortController`

Cancel long-running requests or retries when a user navigates away:

```ts
import lowdeep from "lowdeep";

const ai = lowdeep()
  .key(process.env.OPENAI_API_KEY!)
  .model("gpt-4o");

const controller = new AbortController();

setTimeout(() => {
  controller.abort();
}, 2000);

try {
  const reply = await ai.chat("Generate an extensive essay", {
    signal: controller.signal,
    timeoutMs: 10000,
  });
} catch (err: any) {
  if (err.name === "AbortError") {
    console.log("Request successfully aborted!");
  }
}
```

### Example 10: Multi-agent branching with immutable builders

Lowdeep builders are **100% immutable**. Create base configurations and derive specialized agents without side-effects or state pollution:

```ts
import lowdeep from "lowdeep";

const base = lowdeep()
  .key(process.env.OPENAI_API_KEY!)
  .model("gpt-4o-mini");

// Deriving two isolated agents
const copywriter = base.system("You are an expert copywriter.");
const reviewer = base.system("You are a strict code reviewer.");

// copywriter and reviewer maintain completely separate histories and prompts
```

## How the Builder Works

Typical order:

1. `lowdeep()`
2. `.key(...)`
3. `.model(...)`
4. Optional config (`.system()`, `.temperature()`, `.retry()`, `.schema()`, `.use()`)
5. `.chat(...)`

Type behavior:

- You cannot call `chat()` until `key` and `model` are configured.
- Without output schema, return type is text.
- With output schema, return type is inferred from Zod.

## API Reference

### `lowdeep()`

Creates a new builder instance.

### `.key(value: string)`

Sets API key and infers provider from key prefix:

- `gsk_` -> `groq`
- `sk-or-` -> `openrouter`
- `sk_` or `sk-proj-` -> `openai`
- `together_` -> `together`
- any other prefix -> `deepinfra` (or `ollama` if localhost)

### `.model(value: string)`

Sets model id passed to the provider.

### `.baseURL(url: string)`

Sets a custom OpenAI-compatible endpoint URL (e.g. for Ollama `http://localhost:11434/v1`, vLLM, or corporate proxies).

### `.system(prompt: string)`

Sets system instruction. Default: `"Be a helpful assistant"`.

### `.temperature(value: number)`

Sets temperature from `0` to `2`.
Throws `LowdeepConfigurationError` for values outside this range.
Default: `0.7`.

### `.retry(value: number)`

Sets max retry attempts for the self-healing loop.
Default: `3`.

### `.verbose(enabled?: boolean)`

Enables or disables console logging during attempts. Disabled by default for clean production logs.

### `.structuredOutputMode(mode: "auto" | "strict" | "prompt")`

Controls how structured output is requested from the model:
- `"auto"` (default): Uses native OpenAI-compatible `response_format: { type: "json_schema" }` and automatically falls back to prompt injection if the model does not support it.
- `"strict"`: Enforces strict native `json_schema`.
- `"prompt"`: Disables native `response_format` and uses pure system prompt guidance with Lowdeep's balanced JSON parser.

### `.onAttempt(cb: (attempt: number, maxRetries: number) => void)`

Hook invoked at each chat attempt.

### `.onRetry(cb: (error: unknown, attempt: number, maxRetries: number) => void)`

Hook invoked when a validation error occurs before initiating a self-healing retry.

### `.schema(outputSchema: ZodType, inputSchema?: ZodType)`

- `outputSchema`: validates model response and returns typed object
- `inputSchema`: validates `chat(data)` payload before provider request

### `.clone()`

Creates an isolated duplicate of the current builder instance with cloned conversation history.

### `.use(history: ChatCompletionMessageParam[])`

Replaces current internal history with your own message array.

### `.getHistory()`

Returns a shallow copy of the current message history.

### `.clearHistory()`

Resets current message history to an empty array.

### `.chat(data, options?: CallOptions)`

- `data`: prompt string or structured payload conforming to `inputSchema`.
- `options`: optional `CallOptions` containing:
  - `signal?: AbortSignal` (to cancel active request and retries)
  - `timeoutMs?: number` (request timeout in milliseconds)
  - `headers?: Record<string, string>` (custom HTTP headers)
- Returns validated typed data when `outputSchema` is set, or raw string otherwise.
- Throws `LowdeepMaxRetriesError` if retries are exhausted without a valid schema match.

### `.chatStream(data, options?: CallOptions)`

Streams model text output token by token as an `AsyncGenerator<string, void, unknown>`. Accepts optional `CallOptions` (`signal`, `timeoutMs`, `headers`).

### Legacy `.provider(...)`

A runtime `provider("groq" | "openai" | "deepinfra" | ...)` method exists for compatibility, but key-based provider inference or explicit `baseURL` is the recommended approach.

## Self-Healing JSON Flow

When output schema is configured, Lowdeep:

1. Injects JSON schema guidance in the system message.
2. Requests strict JSON output.
3. Cleans model output (including fenced JSON or reasoning `<think>` tags).
4. Parses and validates with Zod.
5. On failure, appends validation errors and triggers `onRetry` hook.
6. Automatically requests correction from the model in an atomic retry loop.

If all retries fail, Lowdeep throws a `LowdeepMaxRetriesError` containing the attempt count, the last raw response, and the underlying validation errors.

## Provider Behavior

Supported providers (auto-inferred or configured via `baseURL`):

- OpenAI
- Groq
- DeepInfra
- OpenRouter
- Together AI
- Ollama / vLLM / LocalAI (via `.baseURL("http://localhost:11434/v1")`)

All requests are sent through OpenAI-compatible chat completions with HTTP connection pooling.

## Error Handling

Lowdeep exports custom error classes:

- `LowdeepError`: Base error class.
- `LowdeepConfigurationError`: Thrown for invalid configurations (e.g. temperature out of range, missing key/model).
- `LowdeepValidationError`: Thrown when input data violates `inputSchema`.
- `LowdeepMaxRetriesError`: Thrown when all self-healing attempts fail.

Recommended pattern:

```ts
import lowdeep, {
  LowdeepConfigurationError,
  LowdeepMaxRetriesError,
  LowdeepValidationError,
} from "lowdeep";

try {
  const result = await ai.chat("Return JSON with title and score");
  console.log(result);
} catch (error) {
  if (error instanceof LowdeepValidationError) {
    console.error("Input validation failed:", error.issues);
  } else if (error instanceof LowdeepMaxRetriesError) {
    console.error(`Failed after ${error.attempts} attempts. Last response:`, error.lastResponseContent);
  } else {
    console.error("Lowdeep request failed:", error);
  }
}
```

## Development
 
Build the package:
 
```bash
bun run build
```

Run test suite:

```bash
bun test
```

Build output is generated in `dist/`.

## Security Notes

- Do not hardcode API keys in committed files.
- Prefer `process.env.*` for secrets.
- Rotate keys immediately if exposed.

## License

MIT
