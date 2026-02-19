import OpenAI from "openai";
import type { FinalBuilder } from "./builder";
import z from "zod";
import type { ChatCompletionMessageParam } from "openai/resources";

const getBaseURL = (provider: Provider) => {
  if (provider === "deepinfra") return "https://api.deepinfra.com/v1/openai";
  if (provider === "groq") return "https://api.groq.com/openai/v1";

  return `https://api.${provider.toLowerCase()}.com/openai/v1`;
};

type Provider = "groq" | "deepinfra" | "openai";

const inferProvider = (key: string) => {
  if (key.startsWith("gsk_")) return "groq";
  if (key.startsWith("sk_")) return "openai";

  return "deepinfra";
};

const stripReasoningAndMarkdown = (content: string) => {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1")
    .trim();
};

const findBalancedJson = (text: string, fromIndex: number) => {
  const startChar = text[fromIndex];
  if (startChar !== "{" && startChar !== "[") return null;

  const stack: string[] = [startChar];
  let inString = false;
  let escaped = false;

  for (let i = fromIndex + 1; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }

    if (ch === "}" || ch === "]") {
      const last = stack.at(-1);
      const closesObject = ch === "}" && last === "{";
      const closesArray = ch === "]" && last === "[";

      if (!closesObject && !closesArray) return null;
      stack.pop();
      if (stack.length === 0) return text.slice(fromIndex, i + 1);
    }
  }

  return null;
};

const parseJsonLoose = (content: string) => {
  const cleaned = stripReasoningAndMarkdown(content);
  if (!cleaned) throw new Error("Empty response.");

  try {
    return JSON.parse(cleaned);
  } catch {
    // Keep trying with extracted JSON blocks.
  }

  const parsedValues: unknown[] = [];
  let i = 0;

  while (i < cleaned.length) {
    const nextObject = cleaned.indexOf("{", i);
    const nextArray = cleaned.indexOf("[", i);
    const starts = [nextObject, nextArray].filter((idx) => idx >= 0);
    if (starts.length === 0) break;

    const start = Math.min(...starts);
    const block = findBalancedJson(cleaned, start);
    if (!block) break;

    parsedValues.push(JSON.parse(block));
    i = start + block.length;
  }

  if (parsedValues.length === 0) {
    throw new Error("No valid JSON found in the model response.");
  }

  if (parsedValues.length === 1) {
    return parsedValues[0];
  }

  return parsedValues;
};

const getSchemaRootHint = (schema: z.ZodType | null) => {
  if (!schema) return null;
  const jsonSchema = schema.toJSONSchema() as { type?: string | string[] };
  const schemaType = jsonSchema?.type;

  if (schemaType === "array") {
    return "square brackets []";
  }

  if (schemaType === "object") {
    return "curly braces {}";
  }

  if (Array.isArray(schemaType) && schemaType.includes("array")) {
    return "square brackets []";
  }

  return "the exact root type required by the JSON schema";
};

export default function lowdeep() {
  let _key: string, _provider: string, _model: string;
  let _system: string = "Be a helpful assistant";
  let _schema: z.ZodType | null;
  let _nRetry: number = 3;
  let _temperature: number = 0.7;
  let _history: ChatCompletionMessageParam[] = [];

  const instance = {
    use(history: ChatCompletionMessageParam[]) {
      _history = history;
      return instance;
    },
    key(val: string) {
      _key = val;
      const provider = inferProvider(val);
      _provider = provider;
      return instance;
    },
    provider(val: Provider) {
      // DEPRECATED
      _provider = val;
      return instance;
    },
    model(val: string) {
      _model = val;
      return instance;
    },
    retry(val: number) {
      _nRetry = val;
      return instance;
    },
    schema(s: z.ZodType) {
      _schema = s;
      return instance;
    },
    system(prompt: string) {
      _system = prompt;
      return instance;
    },
    temperature(val: number) {
      if (val > 2 || val < 0) {
        throw Error("Temperatures must be a value between 0 and 2.");
      }
      _temperature = val;
      return instance;
    },
    async chat(message: string) {
      const client = new OpenAI({
        apiKey: _key,
        baseURL: getBaseURL(_provider as Provider),
      });

      _history.push({
        role: "user",
        content: message,
      });

      const rootHint = getSchemaRootHint(_schema);
      let messages: any[] = [
        {
          role: "system",
          content: `
          ${_system}
          ${
            _schema
              ? `
              You MUST return only a single valid JSON payload (pure JSON, no markdown, no comments, no <think> tags).
              The response root must use ${rootHint}.
              Follow this schema strictly:
              ${JSON.stringify(_schema.toJSONSchema())}
            `
              : ""
          }
          `,
        },
        ..._history,
      ];

      for (let i = 0; i < _nRetry; i++) {
        process.stdout.write("\r");

        for (let j = 0; j < i; j++) {
          process.stdout.write("🔴 ");
        }

        for (let j = 0; j < _nRetry - i; j++) {
          process.stdout.write("⚪ ");
        }

        process.stdout.write(`[${i + 1}/${_nRetry}] trying....\n`);

        const response = await client.chat.completions.create({
          messages,
          model: _model,
          temperature: _temperature,
          // response_format: _schema ? { type: "json_object" } : undefined,
        });

        const aiMsg = response.choices[0]?.message;
        if (!_schema) {
          _history.push({
            role: "assistant",
            content: aiMsg?.content ?? "Wait, where is the AI message?",
          });

          return aiMsg?.content;
        }

        try {
          const jsonRaw = parseJsonLoose(aiMsg?.content || "");
          const result = _schema.safeParse(jsonRaw);

          if (result.success) {
            _history.push(aiMsg as ChatCompletionMessageParam);

            return result.data;
          }

          const formattedError = z.treeifyError(result.error);
          messages.push(aiMsg as ChatCompletionMessageParam);
          messages.push({
            role: "user",
            content: `Your last JSON response was invalid. 
                      Errors: ${JSON.stringify(formattedError)}. 
                      Please fix the JSON and return only the corrected JSON.`,
          });
        } catch (error: any) {
          if (aiMsg) messages.push(aiMsg);
          messages.push({
            role: "user",
            content: `Your last JSON response was invalid. 
                      Errors: ${JSON.stringify(error.message)}. 
                      Please fix the JSON and return only the corrected JSON.`,
          });

          console.log(JSON.stringify(messages));
        }
      }

      process.stdout.write(
        "\n⚠️ Even with the retries, it was not possible to get a valid answer :(",
      );
    },
  };

  return instance as FinalBuilder<{
    hasKey: false;
    hasProvider: false;
    hasModel: false;
    hasSchema: false;
  }>;
}
