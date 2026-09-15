"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  EventoCobroPos,
  EventoVentaPos,
} from "@/modules/accounting/types";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { runPosSaleAccountingFlow } from "../service/pos-sale-accounting.service";

export type ConfirmPosSaleAccountingStepInput = {
  orgSlug: string;
  posSaleId: string;
  step: "venta" | "cobro";
  informalEntryId: string;
};

export type ConfirmPosSaleAccountingStepResult =
  | { success: true; accountingStatus: string }
  | { success: false; error: string };

type PosSaleAccountingRow = {
  invoice_type: string | null;
  accounting_sale_entry_id: string | null;
  accounting_payment_entry_id: string | null;
  accounting_sale_event_snapshot: EventoVentaPos | null;
  accounting_payment_event_snapshot: EventoCobroPos | null;
};

// Persistido junto con create-pos-sale para el paso pendiente que el
// cajero no resolvió automáticamente; sólo back-office (accounting.manage)
// puede asignar cuentas y confirmar cada asiento.
export async function confirmPosSaleAccountingStepAction(
  input: ConfirmPosSaleAccountingStepInput
): Promise<ConfirmPosSaleAccountingStepResult> {
  await ensure("accounting.manage", input.orgSlug);

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("pos_sales")
    .select(
      "invoice_type, accounting_sale_entry_id, accounting_payment_entry_id, accounting_sale_event_snapshot, accounting_payment_event_snapshot"
    )
    .eq("organization_id", org.id)
    .eq("id", input.posSaleId)
    .maybeSingle();

  if (error || !row) {
    return { success: false, error: "Venta POS no encontrada" };
  }

  const typedRow = row as unknown as PosSaleAccountingRow;

  if (
    !(
      typedRow.accounting_sale_event_snapshot &&
      typedRow.accounting_payment_event_snapshot
    )
  ) {
    return {
      success: false,
      error: "Esta venta no tiene un asiento contable pendiente de revisión.",
    };
  }

  const saleEntryId =
    input.step === "venta"
      ? input.informalEntryId
      : typedRow.accounting_sale_entry_id;
  const paymentEntryId =
    input.step === "cobro"
      ? input.informalEntryId
      : typedRow.accounting_payment_entry_id;

  const patch = await runPosSaleAccountingFlow({
    eventoVenta: typedRow.accounting_sale_event_snapshot,
    eventoCobro: typedRow.accounting_payment_event_snapshot,
    isTicketX: typedRow.invoice_type === "TICKET_X",
    automaticAccountingEnabled: false,
    orgId: org.id,
    existingSaleEntryId: saleEntryId,
    existingPaymentEntryId: paymentEntryId,
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
