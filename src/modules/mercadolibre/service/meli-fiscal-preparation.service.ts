import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  findMeliPaymentJournalRequestServer,
  inspectMeliPostingPeriodServer,
  listMeliAccountReferencesServer,
  listMeliJournalEntriesByOriginServer,
  publishMeliJournalServer,
} from "@/lib/accounting-server";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/lib/supabase/auth";
import { isMeliAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { MELI_PAYMENT_READ_PERMISSIONS } from "../permissions";
import { meliFiscalAttemptSchema } from "../utils/accounting-fiscal-attempt";
import { reviewMeliFiscalHistory } from "../utils/accounting-fiscal-history";
import { buildMeliFiscalAccountingLines } from "../utils/accounting-fiscal-lines";
import {
  assertMeliFiscalPayloadMatchesSource,
  fiscalJournalPayloadSchema,
} from "../utils/accounting-invoice-receipt";
import { getMeliCreditNoteContext } from "./meli-credit-note-read.service";
import {
  getMeliFiscalAccountingSnapshot,
  getMeliFiscalSnapshotForRecovery,
  inspectMeliInvoiceReceipt,
} from "./meli-fiscal-accounting-history.service";
import { coordinateMeliPublication } from "./meli-publication-coordinator";

const originSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("invoice"), saleId: z.uuid() }).strict(),
  z
    .object({
      type: z.literal("creditNote"),
      saleId: z.uuid(),
      creditNoteId: z.uuid(),
    })
    .strict(),
]);

async function context(orgSlug: string) {
  await ensure("mercadolibre.accounting.manage", orgSlug);
  await ensure(MELI_PAYMENT_READ_PERMISSIONS, orgSlug);
  await guardOrganizationModuleAccess(orgSlug, "pos");
  if (!(await isMeliAccountingIntegrationEnabled(orgSlug))) {
    throw new Error("La integración contable Meli no está habilitada.");
  }
  const auth = await requireAuth();
  const org = await getOrganizationBySlug(orgSlug);
  if (!(auth && org)) {
    throw new Error("Usuario u organización no autorizados.");
  }
  return { admin: createAdminClient(), orgId: org.id, actorId: auth.userId };
}

function rpcOrigin(origin: z.output<typeof originSchema>) {
  return {
    p_sale_id: origin.saleId,
    p_origin_type: origin.type,
    p_origin_id:
      origin.type === "invoice" ? origin.saleId : origin.creditNoteId,
  };
}

export async function getMeliFiscalPreparation(
  orgSlug: string,
  rawOrigin: unknown
) {
  const origin = originSchema.parse(rawOrigin);
  const { admin, orgId, actorId } = await context(orgSlug);
  const result = await admin.rpc("get_meli_fiscal_accounting_preparation", {
    p_org_id: orgId,
    p_actor_id: actorId,
    ...rpcOrigin(origin),
  });
  if (result.error) {
    throw new Error(
      `No se pudo consultar la preparación fiscal: ${result.error.message}`
    );
  }
  const rows = z
    .array(
      z.object({
        preparation_id: z.uuid(),
        request_key: z.uuid(),
        source_snapshot: z.record(z.string(), z.unknown()),
        created_by: z.uuid(),
        created_at: z.iso.datetime({ offset: true }),
      })
    )
    .max(1)
    .parse(result.data);
  const row = rows[0];
  return {
    actorId,
    preparation: row
      ? {
          preparationId: row.preparation_id,
          requestKey: row.request_key,
          createdBy: row.created_by,
        }
      : null,
  };
}

export async function prepareMeliFiscal(
  orgSlug: string,
  rawOrigin: unknown,
  rawAttempt: unknown
) {
  const origin = originSchema.parse(rawOrigin);
  const { requestKey, expectedActorId } =
    meliFiscalAttemptSchema.parse(rawAttempt);
  const { admin, orgId, actorId } = await context(orgSlug);
  if (actorId.toLowerCase() !== expectedActorId.toLowerCase()) {
    throw new Error(
      "La solicitud pertenece a otro usuario. Iniciá sesión con el usuario original para recuperarla."
    );
  }
  await getMeliFiscalAccountingSnapshot(orgSlug, origin);
  let result: Awaited<ReturnType<typeof admin.rpc>>;
  try {
    result = await admin.rpc("prepare_meli_fiscal_accounting", {
      p_org_id: orgId,
      p_actor_id: actorId,
      ...rpcOrigin(origin),
      p_request_key: requestKey,
    });
  } catch {
    throw new Error(
      "No se confirmó la preparación fiscal. Consultá su estado o reintentá con la misma clave."
    );
  }
  if (result.error) {
    throw new Error(
      `No se confirmó la preparación fiscal: ${result.error.message}. Consultá su estado antes de reintentar.`
    );
  }
  const rows = z
    .array(z.object({ preparation_id: z.uuid(), idempotent: z.boolean() }))
    .length(1)
    .safeParse(result.data);
  if (!rows.success) {
    throw new Error(
      "La respuesta fiscal no es verificable. Consultá su estado o reintentá con la misma clave."
    );
  }
  return { preparationId: rows.data[0].preparation_id };
}

async function inspectWithoutFiscalDispatch(
  orgSlug: string,
  origin: z.output<typeof originSchema>,
  orgId: string,
  originId: string
) {
  if (origin.type === "creditNote") {
    const { note } = await getMeliCreditNoteContext(
      orgSlug,
      origin.creditNoteId
    );
    if (note.sales_order_id?.toLowerCase() !== origin.saleId.toLowerCase()) {
      throw new Error("La nota de crédito no pertenece a esta venta Meli.");
    }
  }
  const history = await listMeliJournalEntriesByOriginServer({
    orgId,
    referenciaId: originId,
    referenciaTabla:
      origin.type === "invoice" ? "sales_orders" : "credit_notes",
  });
  return {
    dispatchStatus: null,
    journalEntryId: null,
    historyIssues: reviewMeliFiscalHistory(history, origin.type, null),
  };
}

export async function inspectMeliFiscalDispatch(
  orgSlug: string,
  rawOrigin: unknown
) {
  const origin = originSchema.parse(rawOrigin);
  const { admin, orgId, actorId } = await context(orgSlug);
  const result = await admin.rpc("get_meli_fiscal_dispatch_for_recovery", {
    p_org_id: orgId,
    p_actor_id: actorId,
    ...rpcOrigin(origin),
  });
  if (result.error) {
    throw new Error(
      `No se pudo consultar el envío fiscal: ${result.error.message}`
    );
  }
  const rows = z
    .array(
      z
        .object({
          request_key: z.uuid(),
          request_payload: fiscalJournalPayloadSchema,
          dispatch_status: z.enum(["UNCERTAIN", "PUBLISHED"]),
          journal_entry_id: z.uuid().nullable(),
          initiated_by: z.uuid(),
          initiated_at: z.iso.datetime({ offset: true }),
          published_by: z.uuid().nullable(),
          published_at: z.iso.datetime({ offset: true }).nullable(),
        })
        .strict()
    )
    .max(1)
    .parse(result.data);
  const row = rows[0];
  const originId =
    origin.type === "invoice" ? origin.saleId : origin.creditNoteId;
  if (!row) {
    return await inspectWithoutFiscalDispatch(orgSlug, origin, orgId, originId);
  }
  const payload = row.request_payload;
  const equal = (left: string, right: string) =>
    left.toLowerCase() === right.toLowerCase();
  if (
    !(equal(payload.orgId, orgId) && equal(payload.originId, originId)) ||
    payload.originType !== origin.type ||
    !equal(payload.requestKey, row.request_key) ||
    !equal(payload.actorId, row.initiated_by) ||
    (row.dispatch_status === "PUBLISHED") !==
      Boolean(row.journal_entry_id && row.published_by && row.published_at) ||
    (row.dispatch_status === "UNCERTAIN" &&
      Boolean(row.journal_entry_id || row.published_by || row.published_at))
  ) {
    throw new Error("El envío fiscal persistido no coincide con su auditoría.");
  }
  const snapshot = await getMeliFiscalSnapshotForRecovery(orgSlug, origin);
  const accounts = await listMeliAccountReferencesServer(orgId);
  assertMeliFiscalPayloadMatchesSource(
    payload,
    { orgId, originId, originType: origin.type },
    snapshot,
    accounts
  );
  const journalEntryId = await findMeliPaymentJournalRequestServer(payload);
  if (
    row.dispatch_status === "PUBLISHED" &&
    !(
      journalEntryId &&
      row.journal_entry_id &&
      equal(journalEntryId, row.journal_entry_id)
    )
  ) {
    throw new Error(
      "El asiento fiscal publicado no coincide con el recibo contable."
    );
  }
  const history = await listMeliJournalEntriesByOriginServer({
    orgId,
    referenciaId: originId,
    referenciaTabla:
      origin.type === "invoice" ? "sales_orders" : "credit_notes",
  });
  return {
    dispatchStatus: row.dispatch_status,
    journalEntryId,
    historyIssues: reviewMeliFiscalHistory(
      history,
      origin.type,
      journalEntryId
    ),
  };
}

const fiscalDispatchSchema = z
  .object({
    request_key: z.uuid(),
    request_payload: fiscalJournalPayloadSchema,
    dispatch_status: z.enum(["UNCERTAIN", "PUBLISHED"]),
    journal_entry_id: z.uuid().nullable(),
    initiated_by: z.uuid(),
    initiated_at: z.iso.datetime({ offset: true }),
    published_by: z.uuid().nullable(),
    published_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export async function publishMeliFiscal(
  orgSlug: string,
  rawOrigin: unknown,
  rawAssignments: unknown,
  automaticRequestKey?: string
) {
  const origin = originSchema.parse(rawOrigin);
  const assignments = z
    .record(z.string(), z.string().uuid())
    .parse(rawAssignments);
  const initialContext = await context(orgSlug);
  let preparation = await getMeliFiscalPreparation(orgSlug, origin);
  if (!preparation.preparation) {
    await prepareMeliFiscal(orgSlug, origin, {
      requestKey: automaticRequestKey
        ? z.uuid().parse(automaticRequestKey)
        : randomUUID(),
      expectedActorId: initialContext.actorId,
    });
    preparation = await getMeliFiscalPreparation(orgSlug, origin);
  }
  const durable = preparation.preparation;
  if (!durable) {
    throw new Error("No se pudo recuperar la preparación fiscal durable.");
  }
  if (
    durable.createdBy.toLowerCase() !== initialContext.actorId.toLowerCase()
  ) {
    throw new Error(
      "La preparación pertenece a otro usuario; recuperala con el actor original."
    );
  }

  const originId =
    origin.type === "invoice" ? origin.saleId : origin.creditNoteId;
  const getDispatch = async () => {
    const { admin, orgId, actorId } = await context(orgSlug);
    const result = await admin.rpc("get_meli_fiscal_dispatch_for_recovery", {
      p_org_id: orgId,
      p_actor_id: actorId,
      ...rpcOrigin(origin),
    });
    if (result.error) {
      throw new Error(`No se pudo recuperar el envío: ${result.error.message}`);
    }
    const rows = z.array(fiscalDispatchSchema).max(1).parse(result.data);
    const dispatch = rows[0];
    if (!dispatch) {
      return null;
    }
    if (
      dispatch.request_key.toLowerCase() !==
        dispatch.request_payload.requestKey.toLowerCase() ||
      dispatch.initiated_by.toLowerCase() !==
        dispatch.request_payload.actorId.toLowerCase() ||
      (dispatch.dispatch_status === "PUBLISHED") !==
        Boolean(
          dispatch.journal_entry_id &&
            dispatch.published_by &&
            dispatch.published_at
        )
    ) {
      throw new Error(
        "El envío fiscal persistido no coincide con su auditoría."
      );
    }
    return {
      payload: dispatch.request_payload,
      status: dispatch.dispatch_status,
      journalEntryId: dispatch.journal_entry_id,
    } as const;
  };
  const previous = await getDispatch();
  let payload = previous?.payload;
  if (!payload) {
    const snapshot = await getMeliFiscalAccountingSnapshot(orgSlug, origin);
    const fiscalLines = buildMeliFiscalAccountingLines(origin.type, snapshot, {
      receivable: assignments.receivable,
      net: assignments.net,
      exempt: assignments.exempt,
      nonTaxable: assignments.nonTaxable,
      vat: snapshot.vatItems.map((_, index) => assignments[`vat:${index}`]),
      tributes: snapshot.tributeItems.map(
        (_, index) => assignments[`tribute:${index}`]
      ),
    });
    payload = fiscalJournalPayloadSchema.parse({
      orgId: initialContext.orgId,
      originType: origin.type,
      originId,
      componentKey: "fiscal",
      requestKey: durable.requestKey,
      date: snapshot.date,
      description: `Comprobante fiscal Mercado Libre ${originId}`,
      actorId: initialContext.actorId,
      currency: snapshot.currency,
      exchangeRate: String(snapshot.exchangeRate),
      lines: fiscalLines.map(({ key: _key, ...line }) => line),
    });
  }
  const verifyFiscalHistory = async (
    orgId: string,
    request: z.output<typeof fiscalJournalPayloadSchema>
  ) => {
    const [dispatch, receipt, history] = await Promise.all([
      getDispatch(),
      findMeliPaymentJournalRequestServer(request),
      listMeliJournalEntriesByOriginServer({
        orgId,
        referenciaId: originId,
        referenciaTabla:
          origin.type === "invoice" ? "sales_orders" : "credit_notes",
      }),
    ]);
    const expectedReceipt =
      dispatch?.status === "PUBLISHED" ? dispatch.journalEntryId : receipt;
    const receiptMismatch =
      dispatch?.status === "PUBLISHED" &&
      (!receipt ||
        receipt.toLowerCase() !== dispatch.journalEntryId?.toLowerCase());
    const historyMismatch = expectedReceipt
      ? history.length !== 1 ||
        history[0]?.id.toLowerCase() !== expectedReceipt.toLowerCase()
      : history.length > 0;
    if (receiptMismatch || historyMismatch) {
      throw new Error(
        "La historia del comprobante no coincide con su envío verificable; requiere conciliación."
      );
    }
  };
  const verifyCurrentSource = async (
    request: z.output<typeof fiscalJournalPayloadSchema>
  ) => {
    const { orgId, actorId } = await context(orgSlug);
    const latestSnapshot = await getMeliFiscalSnapshotForRecovery(
      orgSlug,
      origin
    );
    assertMeliFiscalPayloadMatchesSource(
      request,
      { orgId, originId, originType: origin.type },
      latestSnapshot,
      await listMeliAccountReferencesServer(orgId)
    );
    if (origin.type === "creditNote") {
      const invoice = await inspectMeliInvoiceReceipt(orgSlug, origin.saleId);
      if (!invoice) {
        throw new Error(
          "La factura Meli debe contabilizarse antes de la nota."
        );
      }
    }
    if (actorId.toLowerCase() !== request.actorId.toLowerCase()) {
      throw new Error("El actor de la solicitud fiscal cambió.");
    }
    await verifyFiscalHistory(orgId, request);
    return orgId;
  };
  const assertEligible = async (
    request: z.output<typeof fiscalJournalPayloadSchema>
  ) => {
    const orgId = await verifyCurrentSource(request);
    const period = await inspectMeliPostingPeriodServer(orgId, request.date);
    if (period.status !== "OPEN") {
      throw new Error(
        "El período contable Meli está cerrado o no configurado."
      );
    }
  };
  await verifyCurrentSource(payload);

  return await coordinateMeliPublication(payload, {
    authorize: async (request) => {
      const { actorId } = await context(orgSlug);
      if (actorId.toLowerCase() !== request.actorId.toLowerCase()) {
        throw new Error("La publicación pertenece a otro usuario.");
      }
    },
    assertEligible: async (request) => {
      if (request.originType === "payment") {
        throw new Error("El origen no corresponde a una publicación fiscal.");
      }
      await assertEligible(fiscalJournalPayloadSchema.parse(request));
    },
    begin: async (request) => {
      const { admin, orgId, actorId } = await context(orgSlug);
      const result = await admin.rpc("begin_meli_fiscal_dispatch", {
        p_org_id: orgId,
        p_actor_id: actorId,
        p_preparation_id: durable.preparationId,
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
    load: getDispatch,
    lookup: (request) => findMeliPaymentJournalRequestServer(request),
    publish: (request) =>
      publishMeliJournalServer({ saleId: origin.saleId, payload: request }),
    confirm: async (request, journalEntryId) => {
      const { admin, orgId, actorId } = await context(orgSlug);
      const result = await admin.rpc("confirm_meli_fiscal_dispatch", {
        p_org_id: orgId,
        p_actor_id: actorId,
        p_preparation_id: durable.preparationId,
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
