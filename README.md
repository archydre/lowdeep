# 🌊 Lowdeep

### The fluent, resilient, and 100% Type-Safe AI SDK.

Lowdeep is a minimalist library designed for developers who are tired of dealing with unpredictable LLM responses. It transforms chaotic text into structured, validated data using a **Self-Healing** mechanism that learns from validation errors in real-time.

[![Sponsor Lowdeep](https://img.shields.io/badge/Sponsor-Lowdeep-ff69b4?style=for-the-badge&logo=github-sponsors)](https://github.com/sponsors/archydre)

---

## ✨ Key Features

- **Fluent API:** Configure your model with a natural, chainable writing experience.
- **Type-Level State Machine:** Our builder pattern uses advanced TypeScript generics to guide you. You physically cannot call `.chat()` until the API key, provider, and model are correctly configured.
- **Native Zod Integration:** Define your response contract once and let Lowdeep handle the validation.
- **Self-Healing Logic:** If the AI fails to follow your schema, Lowdeep injects the specific validation error back into the conversation history and intelligently retries.

---

## 🚀 Installation

```bash
bun add lowdeep
# or
npm install lowdeep
```

---

## 🛠️ Usage

### The Basics

Simple text-based completion with state validation.

```typescript
import lowdeep from "lowdeep";

const ai = await lowdeep()
  .key(process.env.API_KEY)
  .provider("groq")
  .model("llama3-70b-8192")
  .temperature(1.5);

console.log(await ai.chat("What is the biggest country in the world?")); // Russia

// it remembers your chat :)
```

### Structured Output with Self-Healing

Lowdeep uses your Zod schema to guide the AI. If the validation fails, it performs automatic retries by explaining exactly what went wrong to the model.

```typescript
import { z } from "zod";
import lowdeep from "lowdeep";

const CharacterSchema = z.object({
  name: z.string(),
  class: z.enum(["Warrior", "Mage", "Rogue"]),
  stats: z.object({
    strength: z.number(),
    intelligence: z.number(),
  }),
});

const ai = lowdeep().key("your_api_key").provider("openai").model("gpt-4o");

const hero = await ai
  .schema(CharacterSchema) // Enables automatic typing & JSON Mode
  .retry(3) // Auto-corrects up to 3 times on validation failure
  .chat("Generate a random RPG character.");

// Full Autocomplete support!
console.log(hero.name, hero.class, hero.stats.strength);
```

If you store the builder in a variable and configure schema later, keep the typed return from `.schema(...)`:

```typescript
const ai = lowdeep().key("your_api_key").model("gpt-4o");
const aiWithSchema = ai.system("Return strict JSON.").schema(CharacterSchema);

const hero = await aiWithSchema.chat("Generate a random RPG character.");
console.log(hero.name); // typed autocomplete
```

---

## 🧠 Under the Hood

### 1. The Type Guardian

Lowdeep implements a **Type-Level State Machine**. The `chat()` method only becomes available in your IDE's autocomplete once the internal state confirms that all mandatory requirements (Key, Provider, Model) are met.

### 2. The Feedback Loop

When a `schema` is provided, Lowdeep initiates a resilience cycle:

1.  **Injection:** It injects the JSON Schema into the System Prompt.
2.  **Validation:** It parses the response and validates it against **Zod**.
3.  **Correction:** On failure, it captures the detailed Zod error and tells the AI: _"Your last response was invalid: [Specific Error]. Please fix it."_
4.  **Persistence:** It repeats until success or the retry limit is reached.

---

## 🛠️ Supported Providers

Lowdeep works with any provider compatible with the OpenAI API specification:

- OpenAI
- Groq
- DeepInfra

---

## 📄 License

MIT. Build something amazing.
