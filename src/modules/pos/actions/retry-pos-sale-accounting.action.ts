"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  EventoCobroPos,
  EventoVentaPos,
} from "@/modules/accounting/types";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  formalizePosSaleAccountingEntries,
  runPosSaleAccountingFlow,
} from "../service/pos-sale-accounting.service";

export type RetryPosSaleAccountingInput = {
  orgSlug: string;
  posSaleId: string;
};

export type RetryPosSaleAccountingResult =
  | { success: true; accountingStatus: string }
  | { success: false; error: string };

type PosSaleAccountingRow = {
  invoice_type: string | null;
  arca_status: string | null;
  accounting_status: string | null;
  accounting_sale_entry_id: string | null;
  accounting_payment_entry_id: string | null;
  accounting_sale_event_snapshot: EventoVentaPos | null;
  accounting_payment_event_snapshot: EventoCobroPos | null;
};

// Reintenta con el mismo snapshot ya construido (sin recalcular impuestos ni
// categorías) para no arriesgar drift entre la venta original y el reintento.
export async function retryPosSaleAccountingAction(
  input: RetryPosSaleAccountingInput
): Promise<RetryPosSaleAccountingResult> {
  await ensure("accounting.manage", input.orgSlug);

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("pos_sales")
    .select(
      "invoice_type, arca_status, accounting_status, accounting_sale_entry_id, accounting_payment_entry_id, accounting_sale_event_snapshot, accounting_payment_event_snapshot" as never
    )
    .eq("organization_id", org.id)
    .eq("id", input.posSaleId)
    .maybeSingle();

  if (error || !row) {
    return { success: false, error: "Venta POS no encontrada" };
  }

  const typedRow = row as unknown as PosSaleAccountingRow;

  // Ya autorizada por ARCA: lo que falta es formalizar, no recrear los informales.
  if (
    typedRow.arca_status === "authorized" &&
    (typedRow.accounting_status === "PENDING" ||
      typedRow.accounting_status === "PARTIALLY_POSTED") &&
    typedRow.accounting_sale_entry_id &&
    typedRow.accounting_payment_entry_id
  ) {
    const formalizationPatch = await formalizePosSaleAccountingEntries({
      orgId: org.id,
      saleEntryId: typedRow.accounting_sale_entry_id,
      paymentEntryId: typedRow.accounting_payment_entry_id,
    });

    const { error: formalizeUpdateError } = await supabase
      .from("pos_sales")
      .update(formalizationPatch as never)
      .eq("organization_id", org.id)
      .eq("id", input.posSaleId);

    if (formalizeUpdateError) {
      return {
        success: false,
        error: `No se pudo guardar el estado contable: ${formalizeUpdateError.message}`,
      };
    }

    return {
      success: true,
      accountingStatus: formalizationPatch.accounting_status,
    };
  }

  if (
    !(
      typedRow.accounting_sale_event_snapshot &&
      typedRow.accounting_payment_event_snapshot
    )
  ) {
    return {
      success: false,
      error:
        "Esta venta no tiene un evento contable pendiente para reintentar.",
    };
  }

  const orgSettings = await getOrgSettings(input.orgSlug);

  const patch = await runPosSaleAccountingFlow({
    eventoVenta: typedRow.accounting_sale_event_snapshot,
    eventoCobro: typedRow.accounting_payment_event_snapshot,
    isTicketX: typedRow.invoice_type === "TICKET_X",
    automaticAccountingEnabled: orgSettings.automatic_accounting_enabled,
    orgId: org.id,
    existingSaleEntryId: typedRow.accounting_sale_entry_id,
    existingPaymentEntryId: typedRow.accounting_payment_entry_id,
  });

  const { error: updateError } = await supabase
    .from("pos_sales")
    .update(patch as never)
    .eq("organization_id", org.id)
    .eq("id", input.posSaleId);

  if (updateError) {
    return {
      success: false,
      error: `No se pudo guardar el estado contable: ${updateError.message}`,
    };
  }

  return { success: true, accountingStatus: patch.accounting_status };
}
