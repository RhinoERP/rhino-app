import { z } from "zod";

export const meliPaymentAttemptSchema = z
  .object({
    paymentId: z.uuid(),
    draftId: z.uuid(),
    requestKey: z.uuid(),
    expectedActorId: z.uuid(),
  })
  .strict();

export type MeliPaymentAttempt = z.output<typeof meliPaymentAttemptSchema>;

export function meliPaymentAttemptStorageKey(
  orgSlug: string,
  paymentId: string
) {
  return `meli-payment-attempt:${JSON.stringify([orgSlug, paymentId.toLowerCase()])}`;
}

export function readMeliPaymentAttempt(
  storage: Pick<Storage, "getItem">,
  key: string,
  paymentId: string
) {
  const saved = storage.getItem(key);
  if (saved === null) {
    return null;
  }
  try {
    const attempt = meliPaymentAttemptSchema.parse(JSON.parse(saved));
    if (attempt.paymentId.toLowerCase() !== paymentId.toLowerCase()) {
      throw new Error("El cobro guardado no coincide.");
    }
    return attempt;
  } catch (error) {
    throw new Error(
      "La solicitud de preparación guardada no es verificable. No inicies otra; revisá el cobro.",
      { cause: error }
    );
  }
}

export function saveMeliPaymentAttempt(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  raw: MeliPaymentAttempt
) {
  const attempt = meliPaymentAttemptSchema.parse(raw);
  if (readMeliPaymentAttempt(storage, key, attempt.paymentId)) {
    throw new Error("Ya hay una solicitud guardada para este cobro.");
  }
  storage.setItem(key, JSON.stringify(attempt));
  if (
    JSON.stringify(readMeliPaymentAttempt(storage, key, attempt.paymentId)) !==
    JSON.stringify(attempt)
  ) {
    throw new Error("No se guardó la solicitud de preparación exacta.");
  }
  return attempt;
}
