# Lowdeep

Fluent, resilient, type-safe AI SDK for OpenAI-compatible chat models.

Lowdeep helps you move from free-form model output to validated TypeScript objects. It uses Zod for runtime validation and retries automatically when responses do not match your schema.

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
- `sk_` -> `openai`
- any other prefix -> `deepinfra`

### `.model(value: string)`

Sets model id passed to the provider.

### `.system(prompt: string)`

Sets system instruction. Default: `"Be a helpful assistant"`.

### `.temperature(value: number)`

Sets temperature from `0` to `2`.
Throws for values outside this range.
Default: `0.7`.

### `.retry(value: number)`

Sets max retry attempts for the self-healing loop.
Default: `3`.

### `.schema(outputSchema: ZodType, inputSchema?: ZodType)`

- `outputSchema`: validates model response and returns typed object
- `inputSchema`: validates `chat(data)` payload before provider request

### `.use(history: ChatCompletionMessageParam[])`

Replaces current internal history with your own message array.

### `.chat(data)`

- If `inputSchema` exists, input is validated first.
- If `outputSchema` is absent, returns model text.
- If `outputSchema` exists, returns validated typed data.

### Legacy `.provider(...)`

A runtime `provider("groq" | "openai" | "deepinfra")` method exists for compatibility, but key-based provider inference is the intended approach.

## Self-Healing JSON Flow

When output schema is configured, Lowdeep:

1. Injects JSON schema guidance in the system message.
2. Requests strict JSON output.
3. Cleans model output (including fenced JSON or reasoning tags).
4. Parses and validates with Zod.
5. On failure, appends validation errors and retries.

If all retries fail, Lowdeep prints a warning and returns `undefined`.

## Provider Behavior

Supported providers:

- OpenAI
- Groq
- DeepInfra

All requests are sent through OpenAI-compatible chat completions.

## Error Handling

Common failures:

- Provider rejects key/model
- Temperature out of range (`< 0` or `> 2`)
- Input schema validation failure
- Output schema still invalid after all retries

Recommended pattern:

```ts
try {
  const result = await ai.chat("Return JSON with title and score");
  console.log(result);
} catch (error) {
  console.error("Lowdeep request failed:", error);
}
```

## Development

Build the package:

```bash
bun run build
```

Build output is generated in `dist/`.

## Security Notes

- Do not hardcode API keys in committed files.
- Prefer `process.env.*` for secrets.
- Rotate keys immediately if exposed.

## License

MIT
