import type { ZodType } from "zod";
import type z from "zod";

type Compute<T> = { [K in keyof T]: T[K] } & {};

type State = {
  hasKey: boolean;
  // hasProvider: boolean;
  hasModel: boolean;
  hasSchema: boolean;
};

export type FinalBuilder<
  S extends State,
  T extends z.ZodType = z.ZodAny,
> = Compute<
  (S["hasKey"] extends false
    ? {
        key(val: string): FinalBuilder<Omit<S, "hasKey"> & { hasKey: true }, T>;
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
          ): FinalBuilder<Omit<S, "hasModel"> & { hasModel: true }, T>;
        }
      : {}) &
    (S["hasKey"] extends true
      ? // ? S["hasProvider"] extends true
        S["hasModel"] extends true
        ? {
            chat(
              prompt: string,
            ): Promise<S["hasSchema"] extends true ? z.infer<T> : string>;
            schema<NewT extends ZodType>(
              schema: NewT,
            ): FinalBuilder<Omit<S, "hasSchema"> & { hasSchema: true }, NewT>;
            retry(num: number): FinalBuilder<S, T>;
            system(prompt: string): FinalBuilder<S, T>;
            temperature(val: number): FinalBuilder<S, T>;
          }
        : {}
      : {})
  // : {})
>;

type LowdeepBuilder<
  S extends State,
  T extends z.ZodType,
> = (S["hasKey"] extends true
  ? {}
  : {
      key(val: string): FinalBuilder<Omit<S, "hasKey"> & { hasKey: true }, T>;
    }) &
  /* (S["hasProvider"] extends true
    ? {}
    : {
        provider(
          val: string,
        ): FinalBuilder<Omit<S, "hasProvider"> & { hasProvider: true }, T>;
      }) & */
  (S["hasModel"] extends true
    ? {}
    : {
        model(
          val: string,
        ): FinalBuilder<Omit<S, "hasModel"> & { hasModel: true }, T>;
      });
