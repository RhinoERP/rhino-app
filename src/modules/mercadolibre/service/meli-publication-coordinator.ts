import "server-only";
import { z } from "zod";
import { fiscalJournalPayloadSchema } from "../utils/accounting-invoice-receipt";
import { meliPaymentRecoveryPayloadSchema } from "../utils/accounting-payment-recovery";

const payloadSchema = z.union([
  fiscalJournalPayloadSchema,
  meliPaymentRecoveryPayloadSchema,
]);

type Payload = z.output<typeof payloadSchema>;
type Dispatch = {
  payload: Payload;
  status: "UNCERTAIN" | "PUBLISHED";
  journalEntryId: string | null;
};

/**
 * Internal workflow only. Adapters must authorize the actor, validate the
 * source and accounts, and fence reconciliation against concurrent writes.
 * A read-only reconciliation is not a sufficient fence.
 */
export type MeliPublicationCoordinatorPorts = {
  authorize: (payload: Payload) => Promise<void>;
  assertEligible: (payload: Payload) => Promise<void>;
  begin: (payload: Payload) => Promise<Dispatch>;
  load: (payload: Payload) => Promise<Dispatch | null>;
  lookup: (payload: Payload) => Promise<string | null>;
  publish: (payload: Payload) => Promise<string>;
  confirm: (payload: Payload, journalEntryId: string) => Promise<void>;
};

function assertDispatch(expected: Payload, dispatch: Dispatch) {
  const persisted = payloadSchema.parse(dispatch.payload);
  if (
    (dispatch.status !== "UNCERTAIN" && dispatch.status !== "PUBLISHED") ||
    JSON.stringify(persisted) !== JSON.stringify(expected) ||
    (dispatch.status === "PUBLISHED") !== (dispatch.journalEntryId !== null) ||
    (dispatch.journalEntryId !== null &&
      !z.uuid().safeParse(dispatch.journalEntryId).success)
  ) {
    throw new Error("El envío persistido no coincide con la solicitud.");
  }
}

function assertReceipt(id: string | null): asserts id is string {
  if (!(id && z.uuid().safeParse(id).success)) {
    throw new Error("El recibo contable no es verificable.");
  }
}

async function uncertain<T>(action: () => Promise<T>, label: string) {
  try {
    return await action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new Error(
      `${label}: ${detail}. Consultá el estado y reintentá con la misma solicitud y clave.`,
      { cause: error }
    );
  }
}

/**
 * An absent receipt is not proof that a request stopped. Adapters must make
 * publish idempotent for the exact key and payload, including in-flight calls.
 */
export async function coordinateMeliPublication(
  rawPayload: Payload,
  ports: MeliPublicationCoordinatorPorts
) {
  const payload = payloadSchema.parse(rawPayload);
  const request = () => structuredClone(payload);
  await ports.authorize(request());
  let dispatch = await ports.load(request());
  if (!dispatch) {
    await ports.assertEligible(request());
    dispatch = await uncertain(
      () => ports.begin(request()),
      "No se confirmó la reserva del envío"
    );
  }
  assertDispatch(payload, dispatch);

  if (dispatch.status === "PUBLISHED") {
    const verified = await ports.lookup(request());
    assertReceipt(verified);
    if (verified.toLowerCase() !== dispatch.journalEntryId?.toLowerCase()) {
      throw new Error("El recibo publicado no coincide con el asiento.");
    }
    return { journalEntryId: verified };
  }

  let receipt = await ports.lookup(request());
  if (!receipt) {
    await ports.assertEligible(request());
    receipt = await uncertain(
      () => ports.publish(request()),
      "No se confirmó la publicación"
    );
  }
  assertReceipt(receipt);
  const verified = await ports.lookup(request());
  assertReceipt(verified);
  if (verified.toLowerCase() !== receipt.toLowerCase()) {
    throw new Error("El asiento no coincide con el recibo verificado.");
  }
  await uncertain(
    () => ports.confirm(request(), verified),
    "No se confirmó el envío publicado"
  );
  const current = await ports.load(request());
  if (!current) {
    throw new Error(
      "No se encontró el envío confirmado; consultá el estado y reintentá con la misma solicitud y clave."
    );
  }
  assertDispatch(payload, current);
  if (
    current.status !== "PUBLISHED" ||
    current.journalEntryId?.toLowerCase() !== verified.toLowerCase()
  ) {
    throw new Error(
      "No se confirmó el envío; consultá el estado y reintentá con la misma solicitud y clave."
    );
  }
  return { journalEntryId: verified };
}
