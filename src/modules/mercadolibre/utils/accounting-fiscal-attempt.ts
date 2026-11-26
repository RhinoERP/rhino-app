import { z } from "zod";

export const meliFiscalAttemptSchema = z
  .object({
    requestKey: z.uuid(),
    expectedActorId: z.uuid(),
  })
  .strict();

export type MeliFiscalAttempt = z.output<typeof meliFiscalAttemptSchema>;

export function meliFiscalAttemptStorageKey(
  orgSlug: string,
  origin:
    | { type: "invoice"; saleId: string }
    | { type: "creditNote"; saleId: string; creditNoteId: string }
) {
  return `meli-fiscal-attempt:${JSON.stringify([orgSlug, origin.type, origin.saleId, origin.type === "creditNote" ? origin.creditNoteId : null])}`;
}

export function readMeliFiscalAttempt(
  storage: Pick<Storage, "getItem">,
  key: string
) {
  const saved = storage.getItem(key);
  if (saved === null) {
    return null;
  }
  try {
    return meliFiscalAttemptSchema.parse(JSON.parse(saved));
  } catch (error) {
    throw new Error(
      "La solicitud fiscal guardada no es verificable. No inicies otra; revisá la preparación.",
      { cause: error }
    );
  }
}

export function saveMeliFiscalAttempt(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  rawAttempt: MeliFiscalAttempt
) {
  const attempt = meliFiscalAttemptSchema.parse(rawAttempt);
  if (readMeliFiscalAttempt(storage, key)) {
    throw new Error(
      "Ya hay una solicitud guardada. Reintentá esa solicitud antes de iniciar otra."
    );
  }
  storage.setItem(key, JSON.stringify(attempt));
  if (
    JSON.stringify(readMeliFiscalAttempt(storage, key)) !==
    JSON.stringify(attempt)
  ) {
    throw new Error("No se guardó la solicitud fiscal exacta.");
  }
  return attempt;
}
