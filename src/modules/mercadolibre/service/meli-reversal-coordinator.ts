import "server-only";
import { z } from "zod";
import {
  type MeliPaymentRecoveryPayload,
  meliPaymentRecoveryPayloadSchema,
} from "../utils/accounting-payment-recovery";

type ReversalComponent = {
  key: string;
  original: MeliPaymentRecoveryPayload;
  originalEntryId: string;
  requestKey: string;
  confirmedEntryId: string | null;
};

type Reservation = {
  orgId: string;
  paymentId: string;
  preparationId: string;
  reservationId: string;
  requestKey: string;
  date: string;
  description: string;
  actorId: string;
  status: "RESERVED" | "VOIDED";
  components: ReversalComponent[];
};

type Identity = {
  orgId: string;
  paymentId: string;
  reservationId: string;
  requestKey: string;
};

type ReversalRequest = {
  original: MeliPaymentRecoveryPayload;
  reversal: {
    orgId: string;
    originalEntryId: string;
    requestKey: string;
    date: string;
    description: string;
    actorId: string;
  };
};

/**
 * Adapters authorize the actor, verify every source and receipt, and reconcile
 * the complete accounting history before finalizing the commercial void.
 */
export type MeliReversalCoordinatorPorts = {
  loadVerifiedReservation: (identity: Identity) => Promise<Reservation>;
  assertReconciled: (reservation: Reservation) => Promise<void>;
  reverse: (request: ReversalRequest) => Promise<string>;
  verify: (request: ReversalRequest) => Promise<string | null>;
  confirm: (
    identity: Identity,
    component: ReversalComponent,
    reversalEntryId: string
  ) => Promise<void>;
  finalize: (identity: Identity) => Promise<void>;
};

const uuid = z.uuid();
const identitySchema = z
  .object({
    orgId: uuid,
    paymentId: uuid,
    reservationId: uuid,
    requestKey: uuid,
  })
  .strict();

const reservationSchema = z
  .object({
    orgId: uuid,
    paymentId: uuid,
    preparationId: uuid,
    reservationId: uuid,
    requestKey: uuid,
    date: z.iso.date(),
    description: z
      .string()
      .min(1)
      .max(2000)
      .refine((value) => value.trim().length > 0),
    actorId: uuid,
    status: z.enum(["RESERVED", "VOIDED"]),
    components: z
      .array(
        z
          .object({
            key: z.string().min(1).max(200),
            original: meliPaymentRecoveryPayloadSchema,
            originalEntryId: uuid,
            requestKey: uuid,
            confirmedEntryId: uuid.nullable(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

function sameId(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function validateReservation(identity: Identity, reservation: Reservation) {
  if (
    !(
      sameId(identity.orgId, reservation.orgId) &&
      sameId(identity.paymentId, reservation.paymentId) &&
      sameId(identity.reservationId, reservation.reservationId) &&
      sameId(identity.requestKey, reservation.requestKey) &&
      uuid.safeParse(reservation.preparationId).success &&
      uuid.safeParse(reservation.actorId).success &&
      z.iso.date().safeParse(reservation.date).success
    ) ||
    (reservation.status !== "RESERVED" && reservation.status !== "VOIDED") ||
    !reservation.description.trim() ||
    reservation.components.length === 0
  ) {
    throw new Error("La reserva de reversión no coincide con la solicitud.");
  }
  validateComponents(identity, reservation.components);
}

function validateComponents(
  identity: Identity,
  components: ReversalComponent[]
) {
  const keys = new Set<string>();
  const originals = new Set<string>();
  const reversalKeys = new Set<string>();
  const confirmed = new Set<string>();
  for (const component of components) {
    const originalId = component.originalEntryId.toLowerCase();
    const reversalKey = component.requestKey.toLowerCase();
    const confirmedId = component.confirmedEntryId?.toLowerCase();
    if (
      !component.key ||
      keys.has(component.key) ||
      originals.has(originalId) ||
      reversalKeys.has(reversalKey) ||
      !uuid.safeParse(component.originalEntryId).success ||
      !uuid.safeParse(component.requestKey).success ||
      (confirmedId !== undefined &&
        (!uuid.safeParse(confirmedId).success ||
          confirmed.has(confirmedId) ||
          confirmedId === originalId)) ||
      component.original.originType !== "payment" ||
      !sameId(component.original.orgId, identity.orgId) ||
      !sameId(component.original.originId, identity.paymentId) ||
      component.original.componentKey !== component.key
    ) {
      throw new Error("Los componentes de la reserva requieren revisión.");
    }
    keys.add(component.key);
    originals.add(originalId);
    reversalKeys.add(reversalKey);
    if (confirmedId) {
      confirmed.add(confirmedId);
    }
  }
  for (const id of confirmed) {
    if (originals.has(id)) {
      throw new Error(
        "Un contra-asiento coincide con un original de la reserva."
      );
    }
  }
}

function requestFor(
  reservation: Reservation,
  component: ReversalComponent
): ReversalRequest {
  return {
    original: structuredClone(component.original),
    reversal: {
      orgId: reservation.orgId,
      originalEntryId: component.originalEntryId,
      requestKey: component.requestKey,
      date: reservation.date,
      description: reservation.description,
      actorId: reservation.actorId,
    },
  };
}

function assertSameReservation(before: Reservation, after: Reservation) {
  if (
    before.preparationId.toLowerCase() !== after.preparationId.toLowerCase() ||
    before.date !== after.date ||
    before.description !== after.description ||
    !sameId(before.actorId, after.actorId) ||
    before.components.length !== after.components.length
  ) {
    throw new Error("La reserva cambió durante la reversión.");
  }
  for (const component of before.components) {
    const current = after.components.find((item) => item.key === component.key);
    if (
      !(
        current &&
        sameId(component.originalEntryId, current.originalEntryId) &&
        sameId(component.requestKey, current.requestKey)
      ) ||
      JSON.stringify(component.original) !== JSON.stringify(current.original) ||
      (component.confirmedEntryId &&
        !(
          current.confirmedEntryId &&
          sameId(component.confirmedEntryId, current.confirmedEntryId)
        ))
    ) {
      throw new Error("Un componente cambió durante la reversión.");
    }
  }
}

async function verifyReceipt(
  ports: MeliReversalCoordinatorPorts,
  reservation: Reservation,
  component: ReversalComponent,
  expected: string
) {
  const receipt = await ports.verify(requestFor(reservation, component));
  if (
    !(
      receipt &&
      uuid.safeParse(receipt).success &&
      sameId(receipt, expected)
    ) ||
    sameId(receipt, component.originalEntryId)
  ) {
    throw new Error("El contra-asiento no coincide con el recibo verificado.");
  }
}

async function durableOperation<T>(action: () => Promise<T>, label: string) {
  try {
    return await action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new Error(
      `${label}: ${detail}. Consultá el estado y reintentá con la misma reserva y claves.`,
      { cause: error }
    );
  }
}

/** Coordinates durable, receipt-verified reversals before commercial voiding. */
export async function coordinateMeliPaymentReversal(
  rawIdentity: Identity,
  ports: MeliReversalCoordinatorPorts
) {
  const identity = identitySchema.parse(rawIdentity);
  const identityCopy = () => structuredClone(identity);
  const load = async () =>
    reservationSchema.parse(
      await ports.loadVerifiedReservation(identityCopy())
    );
  const initial = await load();
  validateReservation(identity, initial);
  await ports.assertReconciled(structuredClone(initial));
  const expectedReceipts = new Map<string, string>();

  if (initial.status === "RESERVED") {
    for (const component of initial.components) {
      const request = requestFor(initial, component);
      const entryId =
        component.confirmedEntryId ??
        (await durableOperation(
          () => ports.reverse(structuredClone(request)),
          `No se confirmó la reversión de ${component.key}`
        ));
      await verifyReceipt(ports, initial, component, entryId);
      expectedReceipts.set(component.key, entryId);
      if (!component.confirmedEntryId) {
        await durableOperation(
          () =>
            ports.confirm(identityCopy(), structuredClone(component), entryId),
          `No se confirmó el componente ${component.key}`
        );
      }
    }
  }

  const current = await load();
  validateReservation(identity, current);
  assertSameReservation(initial, current);
  for (const component of current.components) {
    if (!component.confirmedEntryId) {
      throw new Error("La reversión tiene componentes sin confirmar.");
    }
    const expected = expectedReceipts.get(component.key);
    if (expected && !sameId(expected, component.confirmedEntryId)) {
      throw new Error(
        "La confirmación no coincide con el contra-asiento verificado."
      );
    }
    await verifyReceipt(ports, current, component, component.confirmedEntryId);
  }
  await ports.assertReconciled(structuredClone(current));
  if (current.status === "RESERVED") {
    await durableOperation(
      () => ports.finalize(identityCopy()),
      "No se confirmó la finalización de la reversión"
    );
  }
  const finished = await load();
  validateReservation(identity, finished);
  assertSameReservation(current, finished);
  if (finished.status !== "VOIDED") {
    throw new Error(
      "No se confirmó la anulación; consultá la reserva y reintentá con la misma clave."
    );
  }
  return { reservationId: finished.reservationId, status: finished.status };
}
