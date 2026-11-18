import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createTypedAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/lib/supabase/auth";
import { buildArcaCreditNoteVoucherRequest } from "@/modules/arca/credit-note-invoice-payload";
import { emitCreditNote } from "@/modules/arca/server/credit-note-invoicing.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { MeliConfirmationError } from "../errors";
import { createMeliCreditNoteSchema } from "../types";
import {
  getMeliCreditNoteContext,
  getMeliCreditSource,
} from "./meli-credit-note-read.service";
import { resolveMeliFiscalReceiver } from "./meli-fiscal-receiver";

export async function createMeliCreditNote(orgSlug: string, raw: unknown) {
  await ensure("mercadolibre.manage", orgSlug);
  await ensure("mercadolibre.invoice", orgSlug);
  const input = createMeliCreditNoteSchema.parse(raw);
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado.");
  }
  const { scopedSale, sale } = await getMeliCreditSource(orgSlug, input.saleId);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        saleId: input.saleId,
        amount: input.amount,
        issueDate: input.issueDate,
        reason: input.reason,
      })
    )
    .digest("hex");
  const admin = createTypedAdminClient();
  async function replay() {
    const existing = await admin
      .from("credit_notes")
      .select("id, created_by, sales_order_id, commercial_snapshot")
      .eq("organization_id", scopedSale.organizationId)
      .eq("sales_channel", "MERCADO_LIBRE")
      .eq("marketplace_idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing.error) {
      throw new Error(
        "No se pudo conciliar el intento de nota de crédito. Conservá el intento y reintentá."
      );
    }
    if (!existing.data) {
      return null;
    }
    const snapshot = existing.data.commercial_snapshot;
    if (
      existing.data.created_by !== auth?.userId ||
      existing.data.sales_order_id !== sale.id ||
      !snapshot ||
      typeof snapshot !== "object" ||
      Array.isArray(snapshot) ||
      snapshot.meli_input_fingerprint !== fingerprint
    ) {
      throw new Error(
        "La clave de confirmación ya corresponde a otra nota de crédito."
      );
    }
    return { creditNoteId: existing.data.id, idempotent: true };
  }
  const previous = await replay();
  if (previous) {
    return previous;
  }
  if (
    sale.arca_status !== "authorized" ||
    !sale.arca_cae ||
    !(
      sale.arca_point_of_sale &&
      sale.arca_voucher_number &&
      sale.arca_voucher_type_code
    )
  ) {
    throw new Error(
      "La venta Meli debe tener una factura autorizada antes de generar una nota de crédito."
    );
  }
  if (input.amount > sale.total_amount) {
    throw new MeliConfirmationError(
      "La nota de crédito supera el importe de la factura.",
      true
    );
  }
  const receiver = resolveMeliFiscalReceiver(
    scopedSale.receiver,
    scopedSale.customer_id
  );
  const fiscalPreview = buildArcaCreditNoteVoucherRequest({
    creditNote: {
      id: input.idempotencyKey,
      amount: input.amount,
      invoiceType: sale.invoice_type,
    },
    sale: {
      id: sale.id,
      saleDate: sale.sale_date,
      invoiceType: sale.invoice_type,
      totalAmount: sale.total_amount,
      arcaPointOfSale: sale.arca_point_of_sale,
      arcaVoucherNumber: sale.arca_voucher_number,
      arcaVoucherTypeCode: sale.arca_voucher_type_code,
      arcaRequestJson: sale.arca_request_json,
      receiverDocument: receiver.document,
      customer: { cuit: receiver.cuit, taxCondition: receiver.taxCondition },
      taxes: sale.taxes.map((tax) => ({
        id: tax.id,
        taxId: tax.tax_id,
        name: tax.name,
        rate: tax.rate,
        baseAmount: tax.base_amount,
        taxAmount: tax.tax_amount,
        taxCodeSnapshot: tax.tax_code_snapshot,
      })),
    },
    pointOfSale: sale.arca_point_of_sale,
    cbteFch: Number(input.issueDate.replaceAll("-", "")),
  });
  const number = await admin.rpc("generate_credit_note_number", {
    org_id: scopedSale.organizationId,
  });
  if (number.error || !number.data) {
    throw new Error("No se pudo asignar el número de nota de crédito.");
  }
  const result = await admin
    .from("credit_notes")
    .insert({
      organization_id: scopedSale.organizationId,
      sales_channel: "MERCADO_LIBRE",
      sales_order_id: sale.id,
      customer_id: scopedSale.customer_id,
      fiscal_receiver_snapshot: scopedSale.receiver,
      marketplace_idempotency_key: input.idempotencyKey,
      commercial_snapshot: z.json().parse({
        version: 1,
        currency: sale.currency,
        meli_input_fingerprint: fingerprint,
        fiscal_preview: fiscalPreview,
        stock_effect: "NONE",
      }),
      credit_note_number: number.data,
      issue_date: input.issueDate,
      amount: input.amount,
      invoice_type: sale.invoice_type,
      origin_type: "MANUAL_ADJUSTMENT",
      reason: input.reason,
      observations: input.reason,
      apply_to_receivable: false,
      applied_to_receivable_amount: 0,
      status: "CONFIRMED",
      is_historical: false,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (result.error || !result.data) {
    const recovered = await replay();
    if (recovered) {
      return recovered;
    }
    throw new MeliConfirmationError(
      result.error?.message.includes("saldo disponible")
        ? "El importe supera el saldo disponible de la factura Meli."
        : "No se pudo confirmar la nota de crédito. Reintentá conservando la misma clave.",
      result.error?.code === "P0001" || result.error?.code === "23514"
    );
  }
  return { creditNoteId: result.data.id, idempotent: false };
}

export function emitMeliCreditNote(orgSlug: string, creditNoteId: string) {
  z.uuid().parse(creditNoteId);
  return emitCreditNote({
    orgSlug,
    creditNoteId,
    salesChannel: "MERCADO_LIBRE",
  });
}

export async function cancelUnissuedMeliCreditNote(
  orgSlug: string,
  creditNoteId: string
) {
  await ensure("mercadolibre.manage", orgSlug);
  await ensure("mercadolibre.invoice", orgSlug);
  const { note, organization } = await getMeliCreditNoteContext(
    orgSlug,
    creditNoteId
  );
  if (note.status === "CANCELLED") {
    return { creditNoteId: note.id };
  }
  if (!["not_requested", "error"].includes(note.arca_status)) {
    throw new Error(
      "Una NC pendiente o autorizada no se puede cancelar desde este flujo."
    );
  }
  const result = await createTypedAdminClient()
    .from("credit_notes")
    .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
    .eq("organization_id", organization.id)
    .eq("sales_channel", "MERCADO_LIBRE")
    .eq("id", note.id)
    .eq("status", "CONFIRMED")
    .in("arca_status", ["not_requested", "error"])
    .select("id")
    .maybeSingle();
  if (result.error || !result.data) {
    throw new Error(
      "La nota de crédito cambió o inició su emisión. Actualizá el detalle."
    );
  }
  return { creditNoteId: note.id };
}
