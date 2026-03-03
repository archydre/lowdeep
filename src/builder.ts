import type { ZodType } from "zod";
import type z from "zod";

type Compute<T> = { [K in keyof T]: T[K] } & {};

type State = {
  hasKey: boolean;
  // hasProvider: boolean;
  hasModel: boolean;
  hasOutputSchema: boolean;
  hasInputSchema: boolean;
};

export type FinalBuilder<
  S extends State,
  Output extends z.ZodType = z.ZodAny,
  Input extends z.ZodType = z.ZodAny,
> = Compute<
  (S["hasKey"] extends false
    ? {
        key(
          val: string,
        ): FinalBuilder<Omit<S, "hasKey"> & { hasKey: true }, Output, Input>;
      }
    : {}) &
    /* (S["hasProvider"] extends false
      ? {
          provider(
            val: string,
          ): FinalBuilder<Omit<S, "hasProvider"> & { hasProvider: true }, T>;
        }
      : {}) & */
    (S["hasModel"] extends false
      ? {
          model(
            val: string,
          ): FinalBuilder<
            Omit<S, "hasModel"> & { hasModel: true },
            Output,
            Input
          >;
        }
      : {}) &
    (S["hasKey"] extends true
      ? // ? S["hasProvider"] extends true
        S["hasModel"] extends true
        ? {
            chat(
              prompt: S["hasInputSchema"] extends true
                ? z.infer<Input>
                : string,
            ): Promise<
              S["hasOutputSchema"] extends true ? z.infer<Output> : string
            >;
            schema<NewOutput extends ZodType, NewInput extends ZodType>(
              output: NewOutput,
              input?: NewInput,
            ): FinalBuilder<
              Omit<S, "hasInputSchema" | "hasOutputSchema"> & {
                hasOutputSchema: true;
                hasInputSchema: NewInput extends z.ZodAny ? false : true;
              },
              NewOutput,
              NewInput
            >;
            retry(num: number): FinalBuilder<S, Output, Input>;
            system(prompt: string): FinalBuilder<S, Output, Input>;
            temperature(val: number): FinalBuilder<S, Output, Input>;
          }
        : {}
      : {})
  // : {})
>;
