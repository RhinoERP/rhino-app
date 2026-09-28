"use server";

import { getInformalEntryServer } from "@/lib/accounting-server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  loadPosSaleAccountingRow,
  persistPosSaleAccountingPatch,
  runPosSaleAccountingFlow,
} from "../service/pos-sale-accounting.service";

export type ConfirmPosSaleAccountingInput = {
  orgSlug: string;
  posSaleId: string;
  informalEntryId: string;
};

export type ConfirmPosSaleAccountingResult =
  | { success: true; accountingStatus: string }
  | { success: false; error: string };

// Vincula el asiento creado desde la bandeja de revisión a su venta POS.
export async function confirmPosSaleAccountingAction(
  input: ConfirmPosSaleAccountingInput
): Promise<ConfirmPosSaleAccountingResult> {
  await ensure("accounting.manage", input.orgSlug);

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  const supabase = await createClient();
  const row = await loadPosSaleAccountingRow({
    supabase,
    orgId: org.id,
    posSaleId: input.posSaleId,
  });

  if (!row) {
    return { success: false, error: "Venta POS no encontrada" };
  }

  if (!row.accounting_sale_event_snapshot) {
    return {
      success: false,
      error: "Esta venta no tiene un asiento contable pendiente de revisión.",
    };
  }

  const isAwaitingReview =
    row.accounting_status === "REVIEW_REQUIRED" ||
    row.accounting_status === "ERROR";

  if (!isAwaitingReview) {
    return {
      success: false,
      error: "Esta venta no está pendiente de revisión contable.",
    };
  }

  if (
    row.accounting_sale_entry_id &&
    row.accounting_sale_entry_id !== input.informalEntryId
  ) {
    return {
      success: false,
      error: "La venta ya tiene otro asiento contable vinculado.",
    };
  }

  const entry = await getInformalEntryServer(input.informalEntryId, org.id);

  const belongsToSale =
    entry?.referencia_id === input.posSaleId &&
    entry.referencia_tabla === "pos_sales" &&
    entry.source_type === "VENTA_POS" &&
    entry.estado_formalizacion === "PENDIENTE";

  if (!belongsToSale) {
    return {
      success: false,
      error: "El asiento indicado no corresponde a esta venta POS.",
    };
  }

  const patch = await runPosSaleAccountingFlow({
    eventoVenta: row.accounting_sale_event_snapshot,
    isTicketX: row.invoice_type === "TICKET_X",
    automaticAccountingEnabled: false,
    orgId: org.id,
    existingSaleEntryId: input.informalEntryId,
    isArcaAuthorized: row.arca_status === "authorized",
  });

  const updateError = await persistPosSaleAccountingPatch({
    supabase,
    orgId: org.id,
    posSaleId: input.posSaleId,
    patch,
  });

  if (updateError) {
    return {
      success: false,
      error: `No se pudo guardar el estado contable: ${updateError}`,
    };
  }

  return { success: true, accountingStatus: patch.accounting_status };
}
