import { z } from "zod";

export const meliPeriodAttemptSchema = z
  .object({
    periodStart: z.iso.date().refine((value) => value.endsWith("-01")),
    expectedStatus: z.enum(["UNCONFIGURED", "OPEN", "CLOSED"]),
    newStatus: z.enum(["OPEN", "CLOSED"]),
    reason: z.string().trim().min(5).max(500),
    requestKey: z.uuid(),
    expectedActorId: z.uuid(),
  })
  .strict()
  .refine((value) => value.expectedStatus !== value.newStatus);

export type MeliPeriodAttempt = z.output<typeof meliPeriodAttemptSchema>;

export function meliPeriodAttemptStorageKey(
  orgSlug: string,
  origin:
    | { type: "invoice"; saleId: string }
    | { type: "creditNote"; saleId: string; creditNoteId: string }
) {
  return `meli-period-attempt:${JSON.stringify([orgSlug, origin.type, origin.saleId, origin.type === "creditNote" ? origin.creditNoteId : null])}`;
}

export function readMeliPeriodAttempt(
  storage: Pick<Storage, "getItem">,
  key: string
) {
  const saved = storage.getItem(key);
  if (saved === null) {
    return null;
  }
  try {
    return meliPeriodAttemptSchema.parse(JSON.parse(saved));
  } catch (error) {
    throw new Error(
      "La solicitud de período guardada no es verificable. No inicies otra; revisá la auditoría.",
      { cause: error }
    );
  }
}
