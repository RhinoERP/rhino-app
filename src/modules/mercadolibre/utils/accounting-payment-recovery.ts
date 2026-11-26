import { z } from "zod";

export const meliPaymentRecoveryPayloadSchema = z
  .object({
    orgId: z.uuid(),
    originType: z.literal("payment"),
    originId: z.uuid(),
    componentKey: z.string().min(1).max(200),
    requestKey: z.uuid(),
    date: z.iso.date(),
    description: z
      .string()
      .min(1)
      .max(2000)
      .refine((value) => value.trim().length > 0),
    actorId: z.uuid(),
    currency: z.enum(["ARS", "USD"]),
    exchangeRate: z.string().regex(/^(0|[1-9]\d{0,5})(?:\.\d{1,4})?$/),
    lines: z
      .array(
        z
          .object({
            accountId: z.uuid(),
            side: z.enum(["DEBE", "HABER"]),
            originalAmount: z
              .string()
              .regex(/^(0|[1-9]\d{0,10})(?:\.\d{1,2})?$/),
            pesosAmount: z.string().regex(/^(0|[1-9]\d{0,10})(?:\.\d{1,2})?$/),
          })
          .strict()
      )
      .min(2)
      .max(200),
  })
  .strict();

export type MeliPaymentRecoveryPayload = z.output<
  typeof meliPaymentRecoveryPayloadSchema
>;
