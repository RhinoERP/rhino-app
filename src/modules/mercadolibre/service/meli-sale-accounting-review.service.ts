import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/lib/supabase/auth";
import { isMeliAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { MELI_PAYMENT_READ_PERMISSIONS } from "../permissions";
import { normalizeMeliAccountingGrossAmount } from "../utils/accounting-components";
import { parseAccountingCents } from "../utils/accounting-money";
import { reviewMeliPaymentDispatches } from "../utils/accounting-payment-reconciliation";
import { listMeliPaymentJournalEntries } from "./meli-accounting-drafts.service";
import { getMeliFiscalSnapshotForRecovery } from "./meli-fiscal-accounting-history.service";
import { inspectMeliFiscalDispatch } from "./meli-fiscal-preparation.service";
import {
  inspectMeliPaymentDispatch,
  inspectMeliPaymentReversals,
  listMeliPaymentPreparations,
} from "./meli-payment-preparations.service";

const currency = z.enum(["ARS", "USD"]);
const amount = z.string().regex(/^(0|[1-9]\d*)(?:\.\d+)?$/);
const sourceSchema = z
  .object({
    saleId: z.uuid(),
    currency,
    amount,
    invoiceStatus: z.string(),
    notes: z.array(
      z.object({
        id: z.uuid(),
        amount,
        currency,
        status: z.string(),
        fiscalStatus: z.string(),
      })
    ),
    payments: z.array(
      z.object({
        id: z.uuid(),
        amount,
        currency,
        status: z.enum(["RECORDED", "VOIDED"]),
      })
    ),
  })
  .strict();

type FiscalOrigin =
  | { type: "invoice"; saleId: string }
  | { type: "creditNote"; saleId: string; creditNoteId: string };
type Payment = z.output<typeof sourceSchema>["payments"][number];
type Preparation = Awaited<
  ReturnType<typeof listMeliPaymentPreparations>
>[number];
type Component = Preparation["components"][number] & { preparationId: string };
type Reversal = Awaited<ReturnType<typeof inspectMeliPaymentReversals>>;
type PaymentReviewContext = {
  payment: Payment;
  preparations: Preparation[];
  components: Component[];
  entries: Awaited<ReturnType<typeof listMeliPaymentJournalEntries>>;
  reversal: Reversal;
};

async function reviewFiscal(
  orgSlug: string,
  origin: FiscalOrigin,
  source: { currency: "ARS" | "USD"; amount: string }
) {
  const inspection = await inspectMeliFiscalDispatch(orgSlug, origin);
  const issues = [...inspection.historyIssues];
  if (!inspection.dispatchStatus) {
    issues.push("Sin envío fiscal identificado.");
  } else if (inspection.dispatchStatus === "UNCERTAIN") {
    issues.push("Envío fiscal incierto; conservar la solicitud original.");
  }
  if (inspection.dispatchStatus) {
    const snapshot = await getMeliFiscalSnapshotForRecovery(orgSlug, origin);
    if (
      snapshot.currency !== source.currency ||
      parseAccountingCents(snapshot.total) !==
        parseAccountingCents(normalizeMeliAccountingGrossAmount(source.amount))
    ) {
      issues.push(
        "El comprobante fiscal no coincide con los datos de la venta."
      );
    }
  }
  return { dispatchStatus: inspection.dispatchStatus, issues };
}

function reviewPaymentHistory({
  payment,
  preparations,
  components,
  entries,
  reversal,
}: PaymentReviewContext) {
  const issues: string[] = [];
  if (reversal) {
    issues.push(...reversal.historyIssues);
    if ((reversal.status === "VOIDED") !== (payment.status === "VOIDED")) {
      issues.push(
        "El estado del cobro no coincide con la reversión consultada."
      );
    }
    if (reversal.status !== "VOIDED") {
      issues.push("La reversión está en curso.");
    }
    if (reversal.components.some((component) => !component.confirmed)) {
      issues.push("Hay contra-asientos sin confirmar.");
    }
  } else {
    issues.push(
      ...reviewMeliPaymentDispatches(entries, preparations).map(
        (issue) => issue.message
      )
    );
    if (
      payment.status === "VOIDED" &&
      components.some((c) => c.dispatchStatus)
    ) {
      issues.push("El cobro anulado tiene envíos sin reserva de reversión.");
    }
  }
  return issues;
}

async function reviewPaymentComponents(
  orgSlug: string,
  { payment, preparations, components, reversal }: PaymentReviewContext
) {
  const issues: string[] = [];
  if (payment.status !== "RECORDED") {
    return issues;
  }
  if (!preparations.some((preparation) => preparation.status === "PREPARED")) {
    issues.push("El cobro no tiene una preparación activa.");
  }
  if (
    preparations.some(
      (preparation) =>
        preparation.status === "PREPARED" && preparation.components.length === 0
    )
  ) {
    issues.push("La preparación activa no tiene componentes verificables.");
  }
  for (const component of components) {
    if (!component.dispatchStatus) {
      issues.push(`${component.description}: componente sin enviar.`);
      continue;
    }
    if (reversal) {
      continue;
    }
    const inspected = await inspectMeliPaymentDispatch(orgSlug, {
      paymentId: payment.id,
      preparationId: component.preparationId,
      componentKey: component.key,
    });
    if (inspected.dispatchStatus === "UNCERTAIN") {
      issues.push(`${component.description}: envío incierto.`);
    }
  }
  return issues;
}

async function reviewPayment(orgSlug: string, payment: Payment) {
  const [preparations, entries, reversal] = await Promise.all([
    listMeliPaymentPreparations(orgSlug, payment.id),
    listMeliPaymentJournalEntries(orgSlug, payment.id),
    inspectMeliPaymentReversals(orgSlug, payment.id),
  ]);
  const components = preparations.flatMap((preparation) =>
    preparation.components
      .filter(
        (component) =>
          preparation.status === "PREPARED" || component.dispatchStatus !== null
      )
      .map((component) => ({
        ...component,
        preparationId: preparation.id,
      }))
  );
  const context = {
    payment,
    preparations,
    components,
    entries,
    reversal,
  };
  const issues = reviewPaymentHistory(context);
  issues.push(...(await reviewPaymentComponents(orgSlug, context)));
  return {
    ...payment,
    components: components.map(
      ({ key, description, dispatchStatus, preparationId }) => ({
        key,
        description,
        dispatchStatus,
        preparationId,
      })
    ),
    reversalStatus: reversal?.status ?? null,
    issues: [...new Set(issues)],
  };
}

async function mapInBatches<T, R>(
  values: T[],
  callback: (value: T) => Promise<R>
): Promise<R[]> {
  const result: R[] = [];
  for (let offset = 0; offset < values.length; offset += 5) {
    result.push(
      ...(await Promise.all(values.slice(offset, offset + 5).map(callback)))
    );
  }
  return result;
}

export async function reviewMeliSaleAccounting(
  orgSlug: string,
  rawSaleId: unknown
) {
  const saleId = z.uuid().parse(rawSaleId).toLowerCase();
  await ensure("mercadolibre.accounting.manage", orgSlug);
  await ensure(MELI_PAYMENT_READ_PERMISSIONS, orgSlug);
  if (!(await isMeliAccountingIntegrationEnabled(orgSlug))) {
    throw new Error("La integración contable Meli no está habilitada.");
  }
  await guardOrganizationModuleAccess(orgSlug, "pos");
  const auth = await requireAuth();
  const org = await getOrganizationBySlug(orgSlug);
  if (!(auth && org)) {
    throw new Error("Usuario u organización no autorizados.");
  }
  const result = await createAdminClient().rpc(
    "get_meli_sale_accounting_review",
    {
      p_org_id: org.id,
      p_actor_id: auth.userId,
      p_sale_id: saleId,
    }
  );
  if (result.error) {
    throw new Error(`No se pudo consultar la venta: ${result.error.message}`);
  }
  const source = sourceSchema.parse(result.data);
  if (source.saleId.toLowerCase() !== saleId) {
    throw new Error("La revisión devolvió una venta diferente.");
  }
  const noteIds = source.notes.map((item) => item.id.toLowerCase());
  const paymentIds = source.payments.map((item) => item.id.toLowerCase());
  if (
    new Set(noteIds).size !== noteIds.length ||
    new Set(paymentIds).size !== paymentIds.length
  ) {
    throw new Error("La revisión contiene identificadores duplicados.");
  }
  const invoice = await reviewFiscal(
    orgSlug,
    { type: "invoice", saleId },
    source
  );
  const notes = await mapInBatches(source.notes, async (note) => {
    const review = await reviewFiscal(
      orgSlug,
      {
        type: "creditNote",
        saleId,
        creditNoteId: note.id,
      },
      note
    );
    if (note.currency !== source.currency) {
      review.issues.push("La moneda de la nota no coincide con la venta.");
    }
    if (
      review.dispatchStatus &&
      (note.status !== "CONFIRMED" || note.fiscalStatus !== "authorized")
    ) {
      review.issues.push(
        "La nota enviada no tiene un estado fiscal y comercial autorizado."
      );
    }
    return { ...note, ...review };
  });
  const payments = await mapInBatches(source.payments, async (payment) => {
    const review = await reviewPayment(orgSlug, payment);
    if (payment.currency !== source.currency) {
      review.issues.push("La moneda del cobro no coincide con la venta.");
    }
    return review;
  });
  if (invoice.dispatchStatus && source.invoiceStatus !== "authorized") {
    invoice.issues.push(
      "La factura enviada no tiene autorización fiscal vigente."
    );
  }
  const issues: string[] = [];
  if (
    (invoice.dispatchStatus !== "PUBLISHED" || invoice.issues.length > 0) &&
    (notes.some((note) => note.dispatchStatus) ||
      payments.some((payment) =>
        payment.components.some((component) => component.dispatchStatus)
      ))
  ) {
    issues.push(
      "Hay envíos dependientes sin una factura publicada verificada."
    );
  }
  return { ...source, invoice, notes, payments, issues };
}
