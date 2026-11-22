import "server-only";
import { z } from "zod";
import { listMeliJournalEntriesByOriginServer } from "@/lib/accounting-server";
import { createTypedAdminClient } from "@/lib/supabase/admin-client";
import { isMeliAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { MELI_PAYMENT_READ_PERMISSIONS } from "../permissions";
import { readMeliAccountingFiscalSnapshot } from "../utils/accounting-fiscal-snapshot";
import {
  getMeliCreditNoteContext,
  getMeliCreditSource,
} from "./meli-credit-note-read.service";
import { getMeliSale } from "./meli-read.service";

const fiscalOrigin = z.discriminatedUnion("type", [
  z.object({ type: z.literal("invoice"), saleId: z.uuid() }).strict(),
  z
    .object({
      type: z.literal("creditNote"),
      saleId: z.uuid(),
      creditNoteId: z.uuid(),
    })
    .strict(),
]);

async function assertAccountingAccess(orgSlug: string) {
  await ensure("mercadolibre.accounting.manage", orgSlug);
  await ensure(MELI_PAYMENT_READ_PERMISSIONS, orgSlug);
  if (!(await isMeliAccountingIntegrationEnabled(orgSlug))) {
    throw new Error("La integración contable Meli no está habilitada.");
  }
}

export async function listMeliFiscalJournalEntries(
  orgSlug: string,
  rawOrigin: unknown
) {
  const origin = fiscalOrigin.parse(rawOrigin);
  await assertAccountingAccess(orgSlug);
  const sale = await getMeliSale(orgSlug, origin.saleId);
  if (!sale) {
    throw new Error("Venta Meli no encontrada o fuera de tus depósitos.");
  }

  if (origin.type === "creditNote") {
    const result = await createTypedAdminClient()
      .from("credit_notes")
      .select("id")
      .eq("organization_id", sale.organizationId)
      .eq("sales_channel", "MERCADO_LIBRE")
      .eq("sales_order_id", sale.id)
      .eq("id", origin.creditNoteId)
      .maybeSingle();
    if (result.error) {
      throw new Error("No se pudo verificar la nota de crédito Meli.");
    }
    if (!result.data) {
      throw new Error("La nota de crédito no pertenece a esta venta Meli.");
    }
  }

  return await listMeliJournalEntriesByOriginServer({
    orgId: sale.organizationId,
    referenciaId: origin.type === "invoice" ? sale.id : origin.creditNoteId,
    referenciaTabla:
      origin.type === "invoice" ? "sales_orders" : "credit_notes",
  });
}

export async function getMeliFiscalAccountingSnapshot(
  orgSlug: string,
  rawOrigin: unknown
) {
  const origin = fiscalOrigin.parse(rawOrigin);
  await assertAccountingAccess(orgSlug);
  if (origin.type === "invoice") {
    const { sale: invoice } = await getMeliCreditSource(orgSlug, origin.saleId);
    return readMeliAccountingFiscalSnapshot({
      status: invoice.arca_status,
      cae: invoice.arca_cae,
      currency: z.enum(["ARS", "USD"]).parse(invoice.currency),
      amount: invoice.total_amount,
      pointOfSale: invoice.arca_point_of_sale,
      voucherType: invoice.arca_voucher_type_code,
      voucherNumber: invoice.arca_voucher_number,
      request: invoice.arca_request_json,
    });
  }
  const { note, sale } = await getMeliCreditNoteContext(
    orgSlug,
    origin.creditNoteId
  );
  if (note.sales_order_id !== origin.saleId.toLowerCase()) {
    throw new Error("La nota de crédito no pertenece a esta venta Meli.");
  }
  return readMeliAccountingFiscalSnapshot({
    status: note.arca_status,
    cae: note.arca_cae,
    currency: z.enum(["ARS", "USD"]).parse(sale.currency),
    amount: note.amount,
    pointOfSale: note.arca_point_of_sale,
    voucherType: note.arca_voucher_type_code,
    voucherNumber: note.arca_voucher_number,
    request: note.arca_request_json,
  });
}
