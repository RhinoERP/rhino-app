declare module "@hookform/resolvers/zod" {
  import type { FieldValues, Resolver } from "react-hook-form";
  import type { input, output, ZodType } from "zod";

  export function zodResolver<
    TSchema extends ZodType,
    TContext = unknown,
    TInput extends FieldValues = input<TSchema> & FieldValues,
    TOutput = output<TSchema>,
  >(
    schema: TSchema,
    schemaOptions?: unknown,
    resolverOptions?: {
      mode?: "async" | "sync";
      raw?: boolean;
    }
  ): Resolver<TInput, TContext, TOutput>;
}
