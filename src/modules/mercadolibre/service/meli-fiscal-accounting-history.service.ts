import "server-only";
import { z } from "zod";
import {
  inspectMeliInvoiceReceiptServer,
  inspectMeliPostingPeriodServer,
  listMeliAccountReferencesServer,
  listMeliJournalEntriesByOriginServer,
} from "@/lib/accounting-server";
import { createTypedAdminClient } from "@/lib/supabase/admin-client";
import { isMeliAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { MELI_PAYMENT_READ_PERMISSIONS } from "../permissions";
import { assertMeliCreditNoteFiscalSource } from "../utils/accounting-credit-note-source";
import { readMeliAccountingFiscalSnapshot } from "../utils/accounting-fiscal-snapshot";
import { assertMeliInvoiceReceiptMatchesFiscal } from "../utils/accounting-invoice-receipt";
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
  return await readMeliFiscalSnapshot(orgSlug, origin);
}

async function readMeliFiscalSnapshot(
  orgSlug: string,
  origin: z.output<typeof fiscalOrigin>
) {
  if (origin.type === "invoice") {
    return await readMeliInvoiceFiscalSnapshot(orgSlug, origin.saleId);
  }

  const { note, sale } = await getMeliCreditNoteContext(
    orgSlug,
    origin.creditNoteId
  );
  if (note.sales_order_id !== origin.saleId.toLowerCase()) {
    throw new Error("La nota de crédito no pertenece a esta venta Meli.");
  }
  assertMeliCreditNoteFiscalSource(sale, note);
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

export async function getMeliFiscalSnapshotForRecovery(
  orgSlug: string,
  rawOrigin: unknown
) {
  const origin = fiscalOrigin.parse(rawOrigin);
  await ensure("mercadolibre.accounting.manage", orgSlug);
  await ensure(MELI_PAYMENT_READ_PERMISSIONS, orgSlug);
  return await readMeliFiscalSnapshot(orgSlug, origin);
}

export async function getMeliInvoiceFiscalSnapshotForRecovery(
  orgSlug: string,
  saleId: string
) {
  await ensure("mercadolibre.accounting.manage", orgSlug);
  await ensure(MELI_PAYMENT_READ_PERMISSIONS, orgSlug);
  return await readMeliInvoiceFiscalSnapshot(orgSlug, z.uuid().parse(saleId));
}

export async function inspectMeliInvoiceReceipt(
  orgSlug: string,
  saleId: string
) {
  const id = z.uuid().parse(saleId);
  await assertAccountingAccess(orgSlug);
  const { scopedSale, sale: invoice } = await getMeliCreditSource(orgSlug, id);
  const snapshot = readMeliAccountingFiscalSnapshot({
    status: invoice.arca_status,
    cae: invoice.arca_cae,
    currency: z.enum(["ARS", "USD"]).parse(invoice.currency),
    amount: invoice.total_amount,
    pointOfSale: invoice.arca_point_of_sale,
    voucherType: invoice.arca_voucher_type_code,
    voucherNumber: invoice.arca_voucher_number,
    request: invoice.arca_request_json,
  });
  const receipt = await inspectMeliInvoiceReceiptServer(
    scopedSale.organizationId,
    id
  );
  if (!receipt) {
    return null;
  }
  const accounts = await listMeliAccountReferencesServer(
    scopedSale.organizationId
  );
  assertMeliInvoiceReceiptMatchesFiscal(
    receipt,
    { orgId: scopedSale.organizationId, saleId: id },
    snapshot,
    accounts
  );
  return { journalEntryId: receipt.journalEntryId };
}

export async function inspectMeliFiscalPostingPeriod(
  orgSlug: string,
  rawOrigin: unknown
) {
  const origin = fiscalOrigin.parse(rawOrigin);
  const snapshot = await getMeliFiscalAccountingSnapshot(orgSlug, origin);
  const sale = await getMeliSale(orgSlug, origin.saleId);
  if (!sale) {
    throw new Error("Venta Meli no encontrada o fuera de tus depósitos.");
  }
  const result = await inspectMeliPostingPeriodServer(
    sale.organizationId,
    snapshot.date
  );
  return { ...result, date: snapshot.date };
}

async function readMeliInvoiceFiscalSnapshot(orgSlug: string, saleId: string) {
  const { sale: invoice } = await getMeliCreditSource(orgSlug, saleId);
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
