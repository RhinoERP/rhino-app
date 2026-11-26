import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  findMeliPaymentJournalRequestServer,
  findMeliPaymentReversalServer,
  inspectMeliPaymentReversalSourceServer,
  inspectMeliPostingPeriodServer,
  listMeliAccountReferencesServer,
  listMeliJournalEntriesByOriginServer,
  publishMeliJournalServer,
  publishMeliPaymentReversalServer,
} from "@/lib/accounting-server";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/lib/supabase/auth";
import { isMeliAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { MeliConfirmationError } from "../errors";
import { MELI_PAYMENT_READ_PERMISSIONS } from "../permissions";
import { normalizeMeliAccountingGrossAmount } from "../utils/accounting-components";
import {
  assertMeliDispatchMatchesSource,
  meliDispatchSourceSchema,
} from "../utils/accounting-dispatch-source";
import {
  convertAccountingToPesos,
  formatAccountingCents,
  parseAccountingCents,
  parseAccountingRate,
} from "../utils/accounting-money";
import { meliPaymentAttemptSchema } from "../utils/accounting-payment-attempt";
import { assertMeliPaymentBreakdownPesos } from "../utils/accounting-payment-lines";
import {
  type MeliPaymentRecoveryPayload,
  meliPaymentRecoveryPayloadSchema,
} from "../utils/accounting-payment-recovery";
import { reviewMeliReversalHistory } from "../utils/accounting-reversal-history";
import { listMeliAccountingDrafts } from "./meli-accounting-drafts.service";
import {
  getMeliInvoiceFiscalSnapshotForRecovery,
  inspectMeliInvoiceReceipt,
} from "./meli-fiscal-accounting-history.service";
import { coordinateMeliPublication } from "./meli-publication-coordinator";
import {
  coordinateMeliPaymentReversal,
  type MeliReversalCoordinatorPorts,
} from "./meli-reversal-coordinator";

const dispatchIdentity = z
  .object({
    paymentId: z.uuid(),
    preparationId: z.uuid(),
    componentKey: z.string().min(1).max(200),
  })
  .strict();
const TRAILING_ZEROES = /0+$/;
const preparationSchema = z.array(
  z.object({
    id: z.uuid(),
    draft_id: z.uuid(),
    status: z.enum(["PREPARED", "CANCELLED"]),
    created_by: z.uuid(),
    created_at: z.iso.datetime({ offset: true }),
    cancelled_by: z.uuid().nullable(),
    cancelled_at: z.iso.datetime({ offset: true }).nullable(),
    components: z.array(
      z
        .object({
          key: z.string().min(1),
          description: z.string().min(1),
          amount: z.string().regex(/^(0|[1-9]\d*)(?:\.\d+)?$/),
          dispatchStatus: z.enum(["UNCERTAIN", "PUBLISHED"]).nullable(),
          journalEntryId: z.uuid().nullable(),
        })
        .refine(
          (component) =>
            (component.dispatchStatus === "PUBLISHED") ===
            (component.journalEntryId !== null),
          "El estado del envío no coincide con el asiento."
        )
    ),
  })
);
const prepareResult = z
  .array(
    z.object({
      preparation_id: z.uuid(),
      preparation_status: z.enum(["PREPARED", "CANCELLED"]),
      idempotent: z.boolean(),
    })
  )
  .length(1);
const cancelResult = z
  .array(z.object({ preparation_id: z.uuid(), idempotent: z.boolean() }))
  .length(1);

const recoveryRow = z
  .object({
    request_key: z.uuid(),
    request_payload: meliPaymentRecoveryPayloadSchema,
    dispatch_status: z.enum(["UNCERTAIN", "PUBLISHED"]),
    journal_entry_id: z.uuid().nullable(),
    initiated_by: z.uuid(),
    initiated_at: z.iso.datetime({ offset: true }),
    published_by: z.uuid().nullable(),
    published_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

async function context(orgSlug: string, requireEnabled = false) {
  await ensure("mercadolibre.accounting.manage", orgSlug);
  await ensure(MELI_PAYMENT_READ_PERMISSIONS, orgSlug);
  await guardOrganizationModuleAccess(orgSlug, "pos");
  if (requireEnabled && !(await isMeliAccountingIntegrationEnabled(orgSlug))) {
    throw new Error("La integración contable Meli no está habilitada.");
  }
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado.");
  }
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }
  return { admin: createAdminClient(), orgId: org.id, actorId: auth.userId };
}

export async function listMeliPaymentPreparations(
  orgSlug: string,
  paymentId: string
) {
  const parsedPaymentId = z.uuid().parse(paymentId);
  const { admin, orgId, actorId } = await context(orgSlug);
  const result = await admin.rpc("list_meli_payment_accounting_preparations", {
    p_org_id: orgId,
    p_actor_id: actorId,
    p_payment_id: parsedPaymentId,
  });
  if (result.error) {
    throw new Error(
      `No se pudo consultar la preparación: ${result.error.message}`
    );
  }
  return preparationSchema.parse(result.data);
}

const reversalReservationSchema = z
  .object({
    reservation_id: z.uuid(),
    preparation_id: z.uuid(),
    request_key: z.uuid(),
    reversal_date: z.iso.date(),
    reason: z.string().min(5).max(500),
    reversal_description: z.string().min(1).max(2000),
    created_by: z.uuid(),
    created_at: z.iso.datetime({ offset: true }),
    status: z.enum(["RESERVED", "FINALIZING", "VOIDED"]),
    payment_status: z.enum(["RECORDED", "VOIDED"]),
    finalized_by: z.uuid().nullable(),
    finalized_at: z.iso.datetime({ offset: true }).nullable(),
    components: z
      .array(
        z
          .object({
            componentKey: z.string().min(1).max(200),
            originalEntryId: z.uuid(),
            requestKey: z.uuid(),
            reversalEntryId: z.uuid().nullable(),
            confirmedBy: z.uuid().nullable(),
            confirmedAt: z.iso.datetime({ offset: true }).nullable(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

async function loadMeliReversalReservation(orgSlug: string, paymentId: string) {
  const { admin, orgId, actorId } = await context(orgSlug);
  const result = await admin.rpc("get_meli_payment_reversal_reservation", {
    p_org_id: orgId,
    p_actor_id: actorId,
    p_payment_id: paymentId,
  });
  if (result.error) {
    throw new Error(
      `No se pudo consultar la reserva de reversión: ${result.error.message}`
    );
  }
  const row = z.array(reversalReservationSchema).max(1).parse(result.data)[0];
  return row ? { row, orgId, actorId } : null;
}

function assertReversalReservationCanResume(
  reservation: z.output<typeof reversalReservationSchema>,
  actorId: string
) {
  if (
    reservation.created_by.toLowerCase() !== actorId.toLowerCase() ||
    (reservation.payment_status === "VOIDED" && reservation.status !== "VOIDED")
  ) {
    throw new Error(
      "La reversión existente pertenece a otra solicitud o requiere revisión manual."
    );
  }
  if (reservation.status === "FINALIZING") {
    throw new Error(
      "La reversión está finalizando; consultá su estado antes de reintentar."
    );
  }
  return reservation;
}

export async function reverseMeliPaymentAccounting(
  orgSlug: string,
  rawPaymentId: unknown,
  rawReason: unknown
) {
  await ensure("mercadolibre.payments.manage", orgSlug);
  const paymentId = z.uuid().parse(rawPaymentId).toLowerCase();
  const reason = z.string().trim().min(5).max(500).parse(rawReason);
  const { admin, orgId, actorId } = await context(orgSlug);
  const preparations = await listMeliPaymentPreparations(orgSlug, paymentId);
  const publishedPreparations = preparations.filter(
    (item) =>
      item.status === "PREPARED" &&
      item.components.some(
        (component) => component.dispatchStatus === "PUBLISHED"
      )
  );
  if (publishedPreparations.length !== 1) {
    throw new Error(
      "Se requiere una única preparación vigente con asientos publicados para iniciar la reversión."
    );
  }
  let reservation = await loadMeliReversalReservation(orgSlug, paymentId);
  if (!reservation) {
    const preparation = publishedPreparations[0];
    if (
      preparation.components.some(
        (component) => component.dispatchStatus === "UNCERTAIN"
      )
    ) {
      throw new Error(
        "Resolvé los envíos inciertos antes de reservar la reversión."
      );
    }
    const firstComponent = preparation.components.find(
      (component) => component.dispatchStatus === "PUBLISHED"
    );
    if (!firstComponent) {
      throw new Error("La preparación no tiene componentes publicados.");
    }
    const originalDispatch = await getMeliPaymentDispatchForRecovery(orgSlug, {
      paymentId,
      preparationId: preparation.id,
      componentKey: firstComponent.key,
    });
    if (!originalDispatch || originalDispatch.dispatch_status !== "PUBLISHED") {
      throw new Error("No se pudo verificar el asiento original del cobro.");
    }
    const today = new Date().toISOString().slice(0, 10);
    const reservationResult = await admin.rpc("reserve_meli_payment_reversal", {
      p_org_id: orgId,
      p_actor_id: actorId,
      p_payment_id: paymentId,
      p_preparation_id: preparation.id,
      p_request_key: randomUUID(),
      p_reversal_date:
        today < originalDispatch.request_payload.date
          ? originalDispatch.request_payload.date
          : today,
      p_reason: reason,
    });
    if (reservationResult.error) {
      throw new Error(
        `No se pudo reservar la reversión: ${reservationResult.error.message}`
      );
    }
    reservation = await loadMeliReversalReservation(orgSlug, paymentId);
  }
  if (!reservation) {
    throw new Error("No se pudo recuperar la reserva de reversión.");
  }
  const durable = assertReversalReservationCanResume(reservation.row, actorId);
  const identity = {
    orgId,
    paymentId,
    reservationId: durable.reservation_id,
    requestKey: durable.request_key,
  };
  const ports: MeliReversalCoordinatorPorts = {
    loadVerifiedReservation: async () => {
      const current = await loadMeliReversalReservation(orgSlug, paymentId);
      if (!current) {
        throw new Error("No se encontró la reserva durable de reversión.");
      }
      const components = await Promise.all(
        current.row.components.map(async (component) => {
          const dispatch = await getMeliPaymentDispatchForRecovery(orgSlug, {
            paymentId,
            preparationId: current.row.preparation_id,
            componentKey: component.componentKey,
          });
          if (!dispatch || dispatch.dispatch_status !== "PUBLISHED") {
            throw new Error(
              "Un asiento original no tiene envío publicado verificable."
            );
          }
          return {
            key: component.componentKey,
            original: dispatch.request_payload,
            originalEntryId: component.originalEntryId,
            requestKey: component.requestKey,
            confirmedEntryId: component.reversalEntryId,
          };
        })
      );
      return {
        orgId: current.orgId,
        paymentId,
        preparationId: current.row.preparation_id,
        reservationId: current.row.reservation_id,
        requestKey: current.row.request_key,
        date: current.row.reversal_date,
        description: current.row.reversal_description,
        actorId: current.row.created_by,
        status: current.row.status === "VOIDED" ? "VOIDED" : "RESERVED",
        components,
      };
    },
    assertReconciled: async () => {
      const history = await inspectMeliPaymentReversals(orgSlug, paymentId);
      if (history && history.historyIssues.length > 0) {
        throw new Error(
          `La historia del cobro requiere revisión: ${history.historyIssues.join("; ")}`
        );
      }
    },
    reverse: async (request) => {
      const period = await inspectMeliPostingPeriodServer(
        orgId,
        request.reversal.date
      );
      if (period.status !== "OPEN") {
        throw new Error(
          "El período contable Meli está cerrado o no configurado."
        );
      }
      return await publishMeliPaymentReversalServer(request);
    },
    verify: async (request) =>
      await findMeliPaymentReversalServer(request.reversal),
    confirm: async (currentIdentity, component, reversalEntryId) => {
      const result = await admin.rpc(
        "confirm_meli_payment_reversal_component",
        {
          p_org_id: currentIdentity.orgId,
          p_actor_id: actorId,
          p_payment_id: currentIdentity.paymentId,
          p_reservation_id: currentIdentity.reservationId,
          p_component_key: component.key,
          p_request_key: component.requestKey,
          p_reversal_entry_id: reversalEntryId,
        }
      );
      if (result.error) {
        throw new Error(
          `No se pudo confirmar el contra-asiento: ${result.error.message}`
        );
      }
      z.array(z.object({ idempotent: z.boolean() }).strict())
        .length(1)
        .parse(result.data);
    },
    finalize: async (currentIdentity) => {
      const result = await admin.rpc("finalize_meli_payment_reversal", {
        p_org_id: currentIdentity.orgId,
        p_actor_id: actorId,
        p_payment_id: currentIdentity.paymentId,
        p_reservation_id: currentIdentity.reservationId,
      });
      if (result.error) {
        throw new Error(
          `No se pudo finalizar la anulación: ${result.error.message}`
        );
      }
      const finalized = z
        .array(
          z.object({ payment_id: z.uuid(), idempotent: z.boolean() }).strict()
        )
        .length(1)
        .parse(result.data)[0];
      if (finalized.payment_id.toLowerCase() !== paymentId) {
        throw new Error("La finalización devolvió otro cobro.");
      }
    },
  };
  return await coordinateMeliPaymentReversal(identity, ports);
}

export async function inspectMeliPaymentReversals(
  orgSlug: string,
  rawPaymentId: unknown
) {
  const paymentId = z.uuid().parse(rawPaymentId);
  const { admin, orgId, actorId } = await context(orgSlug);
  const result = await admin.rpc("get_meli_payment_reversal_reservation", {
    p_org_id: orgId,
    p_actor_id: actorId,
    p_payment_id: paymentId,
  });
  if (result.error) {
    throw new Error(`No se pudo consultar la reserva: ${result.error.message}`);
  }
  const reservation = z
    .array(reversalReservationSchema)
    .max(1)
    .parse(result.data)[0];
  if (!reservation) {
    return null;
  }
  if (
    (reservation.status === "VOIDED") !==
      Boolean(reservation.finalized_by && reservation.finalized_at) ||
    (reservation.status !== "VOIDED" &&
      Boolean(reservation.finalized_by || reservation.finalized_at)) ||
    reservation.status === "FINALIZING" ||
    (reservation.status === "VOIDED") !==
      (reservation.payment_status === "VOIDED")
  ) {
    throw new Error("El estado de la reserva de reversión requiere revisión.");
  }
  const preparations = await listMeliPaymentPreparations(orgSlug, paymentId);
  const preparation = preparations.find(
    (item) => item.id.toLowerCase() === reservation.preparation_id.toLowerCase()
  );
  const published = preparation?.components.filter(
    (component) => component.dispatchStatus === "PUBLISHED"
  );
  if (
    !preparation ||
    preparation.status !== "PREPARED" ||
    preparation.components.some(
      (component) => component.dispatchStatus === "UNCERTAIN"
    ) ||
    !published ||
    published.length !== reservation.components.length
  ) {
    throw new Error("La reserva no coincide con los envíos del cobro.");
  }
  const keys = new Set<string>();
  const originals = new Set<string>();
  const components = await Promise.all(
    reservation.components.map(async (component) => {
      const originalId = component.originalEntryId.toLowerCase();
      const requestKey = component.requestKey.toLowerCase();
      const dispatch = published.find(
        (item) => item.key === component.componentKey
      );
      if (
        keys.has(component.componentKey) ||
        originals.has(originalId) ||
        !dispatch?.journalEntryId ||
        dispatch.journalEntryId.toLowerCase() !== originalId ||
        Boolean(component.reversalEntryId) !==
          Boolean(component.confirmedBy && component.confirmedAt) ||
        (!component.reversalEntryId &&
          Boolean(component.confirmedBy || component.confirmedAt))
      ) {
        throw new Error("Un componente de reversión no coincide con su envío.");
      }
      keys.add(component.componentKey);
      originals.add(originalId);
      const originalDispatch = await getMeliPaymentDispatchForRecovery(
        orgSlug,
        {
          paymentId,
          preparationId: reservation.preparation_id,
          componentKey: component.componentKey,
        }
      );
      if (
        !originalDispatch ||
        originalDispatch.dispatch_status !== "PUBLISHED" ||
        originalDispatch.journal_entry_id?.toLowerCase() !== originalId
      ) {
        throw new Error("La solicitud original no coincide con la reserva.");
      }
      await verifyDispatchSource(
        orgSlug,
        {
          paymentId,
          preparationId: reservation.preparation_id,
          componentKey: component.componentKey,
        },
        originalDispatch.request_payload,
        reservation.payment_status
      );
      const verified = await inspectMeliPaymentReversalSourceServer({
        original: originalDispatch.request_payload,
        reversal: {
          orgId,
          originalEntryId: component.originalEntryId,
          requestKey,
          date: reservation.reversal_date,
          description: reservation.reversal_description,
          actorId: reservation.created_by,
        },
      });
      if (verified.originalEntryId.toLowerCase() !== originalId) {
        throw new Error("El original recuperado no coincide con la reserva.");
      }
      const reversalEntryId = verified.reversalEntryId;
      if (
        component.reversalEntryId &&
        (!reversalEntryId ||
          reversalEntryId.toLowerCase() !==
            component.reversalEntryId.toLowerCase())
      ) {
        throw new Error(
          "La reversión confirmada no coincide con Contabilidad."
        );
      }
      return {
        key: component.componentKey,
        description: dispatch.description,
        reversalEntryId,
        confirmed: component.reversalEntryId !== null,
      };
    })
  );
  if (
    reservation.status === "VOIDED" &&
    components.some((component) => !component.confirmed)
  ) {
    throw new Error("La reserva finalizada tiene reversiones sin confirmar.");
  }
  const history = await listMeliJournalEntriesByOriginServer({
    orgId,
    referenciaId: paymentId,
    referenciaTabla: "mercadolibre_payments",
  });
  const historyIssues = reviewMeliReversalHistory(
    history,
    reservation.components.map((component) => ({
      key: component.componentKey,
      originalEntryId: component.originalEntryId,
      reversalEntryId:
        components.find((item) => item.key === component.componentKey)
          ?.reversalEntryId ?? null,
    }))
  );
  return {
    date: reservation.reversal_date,
    status: reservation.status,
    components,
    historyIssues,
  };
}

export async function getMeliPaymentDispatchForRecovery(
  orgSlug: string,
  raw: unknown
) {
  const input = dispatchIdentity.parse(raw);
  const { admin, orgId, actorId } = await context(orgSlug);
  const result = await admin.rpc("get_meli_payment_dispatch_for_recovery", {
    p_org_id: orgId,
    p_actor_id: actorId,
    p_payment_id: input.paymentId,
    p_preparation_id: input.preparationId,
    p_component_key: input.componentKey,
  });
  if (result.error) {
    throw new Error(`No se pudo consultar el envío: ${result.error.message}`);
  }
  const parsed = z.array(recoveryRow).max(1).parse(result.data);
  const row = parsed[0];
  if (!row) {
    return null;
  }
  const payload = row.request_payload;
  const equal = (left: string, right: string) =>
    left.toLowerCase() === right.toLowerCase();
  if (
    !(
      equal(payload.orgId, orgId) && equal(payload.originId, input.paymentId)
    ) ||
    payload.componentKey !== input.componentKey ||
    !equal(payload.requestKey, row.request_key) ||
    !equal(payload.actorId, row.initiated_by) ||
    (row.dispatch_status === "PUBLISHED") !==
      Boolean(row.journal_entry_id && row.published_by && row.published_at) ||
    (row.dispatch_status === "UNCERTAIN" &&
      Boolean(row.journal_entry_id || row.published_by || row.published_at))
  ) {
    throw new Error(
      "El envío persistido no coincide con el cobro o su auditoría."
    );
  }
  return row;
}

async function verifyDispatchSource(
  orgSlug: string,
  input: z.output<typeof dispatchIdentity>,
  payload: MeliPaymentRecoveryPayload,
  paymentStatus: "RECORDED" | "VOIDED"
) {
  const { admin, orgId, actorId } = await context(orgSlug);
  const sourceResult = await admin.rpc("get_meli_payment_dispatch_source", {
    p_org_id: orgId,
    p_actor_id: actorId,
    p_payment_id: input.paymentId,
    p_preparation_id: input.preparationId,
    p_component_key: input.componentKey,
  });
  if (sourceResult.error) {
    throw new Error(
      `No se pudo consultar la fuente del envío: ${sourceResult.error.message}`
    );
  }
  const source = z
    .array(meliDispatchSourceSchema)
    .length(1)
    .parse(sourceResult.data)[0];
  const accounts = await listMeliAccountReferencesServer(orgId);
  const fiscal = await getMeliInvoiceFiscalSnapshotForRecovery(
    orgSlug,
    source.sale_id
  );
  assertMeliDispatchMatchesSource(payload, source, accounts, {
    ...fiscal,
    expectedPaymentStatus: paymentStatus,
  });
}

export async function inspectMeliPaymentDispatch(
  orgSlug: string,
  raw: unknown
) {
  const dispatch = await getMeliPaymentDispatchForRecovery(orgSlug, raw);
  if (!dispatch) {
    throw new Error(
      "No se encontró el envío; consultá nuevamente antes de iniciar otro."
    );
  }
  const input = dispatchIdentity.parse(raw);
  await verifyDispatchSource(
    orgSlug,
    input,
    dispatch.request_payload,
    "RECORDED"
  );
  const entryId = await findMeliPaymentJournalRequestServer(
    dispatch.request_payload
  );
  if (
    dispatch.dispatch_status === "PUBLISHED" &&
    (!entryId ||
      entryId.toLowerCase() !== dispatch.journal_entry_id?.toLowerCase())
  ) {
    throw new Error(
      "El asiento publicado no coincide con la recuperación contable; requiere revisión."
    );
  }
  return { dispatchStatus: dispatch.dispatch_status, journalEntryId: entryId };
}

const publishComponentInput = z
  .object({
    paymentId: z.uuid(),
    preparationId: z.uuid(),
    componentKey: z.string().min(1).max(200),
  })
  .strict();

async function loadMeliPaymentDispatchSource(
  orgSlug: string,
  input: z.output<typeof publishComponentInput>
) {
  const { admin, orgId, actorId } = await context(orgSlug, true);
  const result = await admin.rpc("get_meli_payment_dispatch_source", {
    p_org_id: orgId,
    p_actor_id: actorId,
    p_payment_id: input.paymentId,
    p_preparation_id: input.preparationId,
    p_component_key: input.componentKey,
  });
  if (result.error) {
    throw new Error(
      `No se pudo consultar la fuente del componente: ${result.error.message}`
    );
  }
  const source = z
    .array(meliDispatchSourceSchema)
    .length(1)
    .parse(result.data)[0];
  return { source, orgId, actorId };
}

function buildMeliPaymentJournalPayload({
  input,
  orgId,
  source,
  fiscal,
  accounts,
  actorId,
  description,
}: {
  input: z.output<typeof publishComponentInput>;
  orgId: string;
  source: z.output<typeof meliDispatchSourceSchema>;
  fiscal: Awaited<ReturnType<typeof getMeliInvoiceFiscalSnapshotForRecovery>>;
  accounts: Awaited<ReturnType<typeof listMeliAccountReferencesServer>>;
  actorId: string;
  description: string;
}) {
  const rate = parseAccountingRate(fiscal.exchangeRate, source.currency);
  const original = parseAccountingCents(
    normalizeMeliAccountingGrossAmount(source.component_amount)
  );
  const pesos = convertAccountingToPesos(original, rate);
  if (original <= BigInt(0) || pesos <= BigInt(0)) {
    throw new Error(
      "El componente no tiene un importe contable representable."
    );
  }
  const resolveAccount = (
    account: z.output<typeof meliDispatchSourceSchema>["debit_account"]
  ) => {
    const id =
      account.kind === "manual"
        ? account.id
        : accounts.find((item) => item.account_code === account.code)?.id;
    if (!id) {
      throw new Error("No se pudo resolver una cuenta del componente.");
    }
    return id;
  };
  const rateWhole = rate / BigInt(10_000);
  const rateFraction = (rate % BigInt(10_000))
    .toString()
    .padStart(4, "0")
    .replace(TRAILING_ZEROES, "");
  const exchangeRate = rateFraction
    ? `${rateWhole}.${rateFraction}`
    : String(rateWhole);
  return meliPaymentRecoveryPayloadSchema.parse({
    orgId,
    originType: "payment",
    originId: input.paymentId,
    componentKey: input.componentKey,
    requestKey: randomUUID(),
    date: source.payment_date,
    description,
    actorId,
    currency: source.currency,
    exchangeRate,
    lines: [
      {
        accountId: resolveAccount(source.debit_account),
        side: "DEBE",
        originalAmount: formatAccountingCents(original),
        pesosAmount: formatAccountingCents(pesos),
      },
      {
        accountId: resolveAccount(source.credit_account),
        side: "HABER",
        originalAmount: formatAccountingCents(original),
        pesosAmount: formatAccountingCents(pesos),
      },
    ],
  });
}

export async function publishMeliPaymentComponent(
  orgSlug: string,
  rawInput: unknown
) {
  const input = publishComponentInput.parse(rawInput);
  const { actorId: initialActor } = await context(orgSlug, true);
  const preparations = await listMeliPaymentPreparations(
    orgSlug,
    input.paymentId
  );
  const preparation = preparations.find(
    (item) => item.id.toLowerCase() === input.preparationId.toLowerCase()
  );
  if (!preparation || preparation.status !== "PREPARED") {
    throw new Error("La preparación contable no está vigente.");
  }
  const component = preparation.components.find(
    (item) => item.key === input.componentKey
  );
  if (!component) {
    throw new Error("El componente no pertenece a la preparación.");
  }
  const { source, orgId, actorId } = await loadMeliPaymentDispatchSource(
    orgSlug,
    input
  );
  if (actorId.toLowerCase() !== initialActor.toLowerCase()) {
    throw new Error("El actor de la solicitud cambió.");
  }
  const existing = await getMeliPaymentDispatchForRecovery(orgSlug, input);
  const fiscal = await getMeliInvoiceFiscalSnapshotForRecovery(
    orgSlug,
    source.sale_id
  );
  const accounts = await listMeliAccountReferencesServer(orgId);
  const payload =
    existing?.request_payload ??
    buildMeliPaymentJournalPayload({
      input,
      orgId,
      source,
      fiscal,
      accounts,
      actorId,
      description: component.description,
    });

  const verifyCurrentSource = async (request: MeliPaymentRecoveryPayload) => {
    const latest = await loadMeliPaymentDispatchSource(orgSlug, input);
    const currentFiscal = await getMeliInvoiceFiscalSnapshotForRecovery(
      orgSlug,
      latest.source.sale_id
    );
    const currentAccounts = await listMeliAccountReferencesServer(latest.orgId);
    assertMeliDispatchMatchesSource(
      request,
      latest.source,
      currentAccounts,
      currentFiscal
    );
    const invoice = await inspectMeliInvoiceReceipt(
      orgSlug,
      latest.source.sale_id
    );
    if (!invoice) {
      throw new Error(
        "La factura Meli debe estar contabilizada antes del cobro."
      );
    }
    if (latest.actorId.toLowerCase() !== request.actorId.toLowerCase()) {
      throw new Error("El actor del envío no coincide con la sesión.");
    }
    const [entries, allPreparations, pendingReceipt] = await Promise.all([
      listMeliJournalEntriesByOriginServer({
        orgId: latest.orgId,
        referenciaId: input.paymentId,
        referenciaTabla: "mercadolibre_payments",
      }),
      listMeliPaymentPreparations(orgSlug, input.paymentId),
      findMeliPaymentJournalRequestServer(request),
    ]);
    const linkedIds = new Set(
      allPreparations.flatMap((item) =>
        item.components
          .filter(
            (entry) =>
              entry.dispatchStatus === "PUBLISHED" && entry.journalEntryId
          )
          .map((entry) => entry.journalEntryId?.toLowerCase() ?? "")
      )
    );
    if (pendingReceipt) {
      linkedIds.add(pendingReceipt.toLowerCase());
    }
    if (entries.some((entry) => !linkedIds.has(entry.id.toLowerCase()))) {
      throw new Error(
        "El cobro tiene asientos sin despacho verificable; requiere conciliación."
      );
    }
    return latest;
  };
  const assertEligible = async (request: MeliPaymentRecoveryPayload) => {
    const latest = await verifyCurrentSource(request);
    const [drafts, currentPreparations, currentFiscal] = await Promise.all([
      listMeliAccountingDrafts(orgSlug, input.paymentId),
      listMeliPaymentPreparations(orgSlug, input.paymentId),
      getMeliInvoiceFiscalSnapshotForRecovery(orgSlug, latest.source.sale_id),
    ]);
    const currentPreparation = currentPreparations.find(
      (item) =>
        item.id.toLowerCase() === input.preparationId.toLowerCase() &&
        item.status === "PREPARED"
    );
    const draft = drafts.find(
      (item) =>
        item.active &&
        item.id.toLowerCase() === currentPreparation?.draft_id.toLowerCase()
    );
    if (
      !(currentPreparation && draft) ||
      draft.currency !== latest.source.currency ||
      draft.payment_date !== latest.source.payment_date
    ) {
      throw new Error("El desglose vigente no coincide con el cobro.");
    }
    const components = assertMeliPaymentBreakdownPesos(
      { grossAmount: draft.gross_amount, currency: draft.currency },
      draft.request_payload.breakdown,
      currentFiscal
    );
    if (
      components.length !== currentPreparation.components.length ||
      components.some((expected) => {
        const actual = currentPreparation.components.find(
          (item) => item.key === expected.key
        );
        return (
          !actual ||
          parseAccountingCents(
            normalizeMeliAccountingGrossAmount(actual.amount)
          ) !== parseAccountingCents(expected.amount)
        );
      })
    ) {
      throw new Error("La preparación no coincide con el desglose vigente.");
    }
    const period = await inspectMeliPostingPeriodServer(
      latest.orgId,
      request.date
    );
    if (period.status !== "OPEN") {
      throw new Error(
        "El período contable Meli está cerrado o no configurado."
      );
    }
  };
  await verifyCurrentSource(payload);

  return await coordinateMeliPublication(payload, {
    authorize: async (request) => {
      const current = await context(orgSlug, true);
      if (current.actorId.toLowerCase() !== request.actorId.toLowerCase()) {
        throw new Error("La publicación pertenece a otro usuario.");
      }
    },
    assertEligible: async (request) => {
      if (request.originType !== "payment") {
        throw new Error("El origen no corresponde a un componente de cobro.");
      }
      await assertEligible(meliPaymentRecoveryPayloadSchema.parse(request));
    },
    begin: async (request) => {
      const current = await context(orgSlug, true);
      const result = await current.admin.rpc("begin_meli_payment_dispatch", {
        p_org_id: current.orgId,
        p_actor_id: current.actorId,
        p_preparation_id: input.preparationId,
        p_component_key: input.componentKey,
        p_request_key: request.requestKey,
        p_request_payload: request,
      });
      if (result.error) {
        throw new Error(
          `No se pudo reservar el envío: ${result.error.message}`
        );
      }
      const row = z
        .array(
          z.object({
            dispatch_status: z.enum(["UNCERTAIN", "PUBLISHED"]),
            journal_entry_id: z.uuid().nullable(),
            idempotent: z.boolean(),
          })
        )
        .length(1)
        .parse(result.data)[0];
      return {
        payload: request,
        status: row.dispatch_status,
        journalEntryId: row.journal_entry_id,
      };
    },
    load: async () => {
      const dispatch = await getMeliPaymentDispatchForRecovery(orgSlug, input);
      return dispatch
        ? {
            payload: dispatch.request_payload,
            status: dispatch.dispatch_status,
            journalEntryId: dispatch.journal_entry_id,
          }
        : null;
    },
    lookup: (request) => findMeliPaymentJournalRequestServer(request),
    publish: (request) =>
      publishMeliJournalServer({
        saleId: source.sale_id,
        payload: request,
      }),
    confirm: async (request, journalEntryId) => {
      const current = await context(orgSlug, true);
      const result = await current.admin.rpc("confirm_meli_payment_dispatch", {
        p_org_id: current.orgId,
        p_actor_id: current.actorId,
        p_preparation_id: input.preparationId,
        p_component_key: input.componentKey,
        p_request_key: request.requestKey,
        p_request_payload: request,
        p_journal_entry_id: journalEntryId,
      });
      if (result.error) {
        throw new Error(
          `No se pudo confirmar el envío: ${result.error.message}`
        );
      }
    },
  });
}

export async function prepareMeliPayment(orgSlug: string, raw: unknown) {
  const input = meliPaymentAttemptSchema.parse(raw);
  const { admin, orgId, actorId } = await context(orgSlug, true);
  if (actorId.toLowerCase() !== input.expectedActorId.toLowerCase()) {
    throw new Error(
      "La solicitud pertenece a otro usuario. Iniciá sesión con el usuario original para recuperarla."
    );
  }
  let result: Awaited<ReturnType<typeof admin.rpc>>;
  try {
    result = await admin.rpc("prepare_meli_accounting_payment", {
      p_org_id: orgId,
      p_actor_id: actorId,
      p_payment_id: input.paymentId,
      p_draft_id: input.draftId,
      p_idempotency_key: input.requestKey,
    });
  } catch {
    throw new MeliConfirmationError(
      "No se confirmó la preparación. Reintentá con la misma clave o consultá el estado.",
      false
    );
  }
  if (result.error) {
    const rolledBack = [
      "P0001",
      "22023",
      "23505",
      "42501",
      "40001",
      "40P01",
    ].includes(result.error.code);
    throw new MeliConfirmationError(
      rolledBack
        ? result.error.message
        : "No se confirmó la preparación. Reintentá con la misma clave o consultá el estado.",
      rolledBack
    );
  }
  const parsed = prepareResult.safeParse(result.data);
  if (!parsed.success) {
    throw new MeliConfirmationError(
      "La respuesta de preparación no es verificable. Reintentá con la misma clave.",
      false
    );
  }
  return parsed.data[0];
}

export async function getMeliPreparationActor(orgSlug: string) {
  const { actorId } = await context(orgSlug, true);
  return { actorId };
}

export async function cancelMeliPaymentPreparation(
  orgSlug: string,
  preparationId: string
) {
  const id = z.uuid().parse(preparationId).toLowerCase();
  const { admin, orgId, actorId } = await context(orgSlug);
  let result: Awaited<ReturnType<typeof admin.rpc>>;
  try {
    result = await admin.rpc("cancel_meli_accounting_payment_preparation", {
      p_org_id: orgId,
      p_actor_id: actorId,
      p_preparation_id: id,
    });
  } catch {
    throw new Error(
      "No se confirmó la cancelación. Consultá el estado y reintentá."
    );
  }
  if (result.error) {
    throw new Error(
      `No se pudo cancelar la preparación: ${result.error.message}`
    );
  }
  const parsed = cancelResult.safeParse(result.data);
  if (!parsed.success || parsed.data[0].preparation_id !== id) {
    throw new Error(
      "No se recibió una confirmación verificable de la cancelación."
    );
  }
  return parsed.data[0];
}
