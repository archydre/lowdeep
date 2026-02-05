import OpenAI from "openai";
import type { FinalBuilder } from "./builder";
import z from "zod";

const getBaseURL = (provider: string) => {
  return `https://api.${provider.toLowerCase()}.com/openai/v1`;
};

type Provider = "groq" | "deepinfra";

export default function lowdeep() {
  let _key: string, _provider: string, _model: string;
  let _system: string = "Be a helpful assistant";
  let _schema: z.ZodType | null;
  let _nRetry: number = 3;

  // Objeto base com todas as funções
  const instance = {
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
    async chat(message: string) {
      const client = new OpenAI({
        apiKey: _key,
        baseURL: getBaseURL(_provider),
      });

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
        { role: "user", content: message },
      ];

      for (let i = 0; i < _nRetry; i++) {
        const response = await client.chat.completions.create({
          messages,
          model: _model,
          // response_format: _schema ? { type: "json_object" } : undefined,
        });

        const aiMsg = response.choices[0]?.message;
        if (!_schema) return aiMsg;

        try {
          const jsonRaw = JSON.parse(aiMsg?.content || "{}");
          const result = _schema.safeParse(jsonRaw);

          if (result.success) return result.data;

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
