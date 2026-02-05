import OpenAI from "openai";
import type { FinalBuilder } from "./builder";
import z from "zod";
import type { ChatCompletionMessageParam } from "openai/resources";

const getBaseURL = (provider: string) => {
  return `https://api.${provider.toLowerCase()}.com/openai/v1`;
};

type Provider = "groq" | "deepinfra" | "openai";

export default function lowdeep() {
  let _key: string, _provider: string, _model: string;
  let _system: string = "Be a helpful assistant";
  let _schema: z.ZodType | null;
  let _nRetry: number = 3;
  let _temperature: number = 0.7;
  let _history: ChatCompletionMessageParam[] = [];

  // Objeto base com todas as funções
  const instance = {
    use(history: ChatCompletionMessageParam[]) {
      _history = history;
      return instance;
    },
    key(val: string) {
      _key = val;
      return instance;
    },
    provider(val: string) {
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
        baseURL: getBaseURL(_provider),
      });

      _history.push({
        role: "user",
        content: message,
      });

      console.log(
        `history so far(after user's message): ${JSON.stringify(_history)}`,
      );

      let messages: any[] = [
        {
          role: "system",
          content: `
          ${_system}
          ${
            _schema
              ? `
              You MUST return a single valid JSON based on the schema below(strictly):
              ${JSON.stringify(_schema.toJSONSchema())}
            `
              : ""
          }
          `,
        },
        ..._history,
      ];

      for (let i = 0; i < _nRetry; i++) {
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
          console.log(
            `history after not having schema: ${JSON.stringify(_history)}`,
          );
          return aiMsg?.content;
        }

        try {
          const jsonRaw = JSON.parse(aiMsg?.content || "{}");
          const result = _schema.safeParse(jsonRaw);

          if (result.success) {
            _history.push(aiMsg as ChatCompletionMessageParam);
            console.log(
              `history after success with a schema: ${JSON.stringify(_history)}`,
            );
            return result.data;
          }

          console.log(
            `❌ Try ${i + 1}/${_nRetry} failed. Injecting error and trying again...`,
          );

          const formattedError = z.treeifyError(result.error);
          messages.push({
            role: "user",
            content: `Your last JSON response was invalid. 
                      Errors: ${JSON.stringify(formattedError)}. 
                      Please fix the JSON and return only the corrected object.`,
          });
        } catch (error) {
          messages.push(aiMsg);
          messages.push({
            role: "user",
            content:
              "You must return a valid JSON object. Do not include markdown blocks or text explanations.",
          });
        }
      }

      throw new Error(
        "⚠️ Even with the retries, it was not possible to get a valid answer :(",
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
