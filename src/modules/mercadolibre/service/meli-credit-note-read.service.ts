import "server-only";
import { z } from "zod";
import { createTypedAdminClient } from "@/lib/supabase/admin-client";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { MELI_READ_PERMISSIONS } from "../permissions";
import { meliReceiverSchema } from "../types";
import { sumMeliMoney } from "../utils/money";
import { getMeliSale } from "./meli-read.service";

export async function getMeliCreditSource(orgSlug: string, saleId: string) {
  const scopedSale = await getMeliSale(orgSlug, saleId);
  if (!scopedSale) {
    throw new Error("Factura Meli no encontrada o fuera de tus depósitos.");
  }
  const result = await createTypedAdminClient()
    .from("sales_orders")
    .select(
      "id, status, sale_date, sale_number, invoice_type, invoice_number, total_amount, currency, arca_status, arca_cae, arca_authorized_at, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_request_json, fiscal_receiver_snapshot, taxes:sales_order_taxes(id, tax_id, name, rate, base_amount, tax_amount, tax_code_snapshot)"
    )
    .eq("organization_id", scopedSale.organizationId)
    .eq("sales_channel", "MERCADO_LIBRE")
    .eq("id", scopedSale.id)
    .eq("warehouse_id", scopedSale.warehouse_id)
    .eq("taxes.organization_id", scopedSale.organizationId)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new Error("No se pudo cargar la factura Meli de origen.");
  }
  return { scopedSale, sale: result.data };
}

export async function listMeliCreditNotes(orgSlug: string, saleId: string) {
  const sale = await getMeliSale(orgSlug, saleId);
  if (!sale) {
    throw new Error("Venta Meli no encontrada o fuera de tus depósitos.");
  }
  const query = createTypedAdminClient()
    .from("credit_notes")
    .select(
      "id, credit_note_number, amount, issue_date, reason, status, arca_status, arca_last_error, arca_point_of_sale, arca_voucher_number"
    )
    .eq("organization_id", sale.organizationId)
    .eq("sales_channel", "MERCADO_LIBRE")
    .eq("sales_order_id", sale.id)
    .order("created_at")
    .order("id");
  const notes: NonNullable<Awaited<typeof query>["data"]> = [];
  for (let offset = 0; ; offset += 500) {
    const result = await query.range(offset, offset + 499);
    if (result.error) {
      throw new Error("No se pudieron consultar las notas de crédito Meli.");
    }
    notes.push(...result.data);
    if (result.data.length < 500) {
      break;
    }
  }
  const reserved = sumMeliMoney(
    notes
      .filter((note) => note.status === "CONFIRMED")
      .map((note) => note.amount)
  );
  return {
    sale,
    notes,
    remaining: sumMeliMoney([sale.total_amount, -reserved]),
  };
}

/** Server-only fiscal context; authorization precedes every elevated read. */
export async function getMeliCreditNoteContext(
  orgSlug: string,
  noteId: string
) {
  z.uuid().parse(noteId);
  await ensure(MELI_READ_PERMISSIONS, orgSlug);
  await guardOrganizationModuleAccess(orgSlug, "pos");
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }
  const admin = createTypedAdminClient();
  const noteResult = await admin
    .from("credit_notes")
    .select("*")
    .eq("organization_id", org.id)
    .eq("sales_channel", "MERCADO_LIBRE")
    .eq("id", noteId)
    .maybeSingle();
  const note = noteResult.data;
  if (noteResult.error || !note?.sales_order_id) {
    throw new Error("Nota de crédito Meli no encontrada.");
  }
  const scopedSale = await getMeliSale(orgSlug, note.sales_order_id);
  if (!scopedSale) {
    throw new Error(
      "La nota de crédito está fuera de tus depósitos asignados."
    );
  }
  const saleResult = await admin
    .from("sales_orders")
    .select(
      "id, status, sale_date, sale_number, invoice_type, invoice_number, total_amount, currency, arca_status, arca_cae, arca_authorized_at, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_request_json, fiscal_receiver_snapshot, taxes:sales_order_taxes(id, tax_id, name, rate, base_amount, tax_amount, tax_code_snapshot)"
    )
    .eq("organization_id", org.id)
    .eq("sales_channel", "MERCADO_LIBRE")
    .eq("id", note.sales_order_id)
    .eq("warehouse_id", scopedSale.warehouse_id)
    .eq("taxes.organization_id", org.id)
    .maybeSingle();
  if (saleResult.error || !saleResult.data) {
    throw new Error("No se pudo cargar la factura Meli de origen.");
  }
  const receiver = meliReceiverSchema.parse(note.fiscal_receiver_snapshot);
  const originalReceiver = meliReceiverSchema.parse(
    saleResult.data.fiscal_receiver_snapshot
  );
  if (JSON.stringify(receiver) !== JSON.stringify(originalReceiver)) {
    throw new Error(
      "El receptor de la nota de crédito no coincide con su factura."
    );
  }
  return { organization: org, note, sale: saleResult.data, receiver };
}
