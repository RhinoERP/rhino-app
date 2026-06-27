"use server";

import { revalidatePath } from "next/cache";
import { buildFacturaCompra } from "@/lib/accounting-client";
import { createInformalEntry } from "@/lib/accounting-server";
import { createClient } from "@/lib/supabase/server";
import { isAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import type { EventoFacturaCompra } from "@/modules/accounting/types";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getPurchaseOrderWithItems,
  updatePurchaseOrderStatus,
} from "../service/purchases.service";

export async function updatePurchaseStatusAction(
  orgSlug: string,
  purchaseOrderId: string,
  status: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED",
  options?: {
    delivery_date?: string;
    logistics?: string;
  }
) {
  try {
    const purchaseOrder = await updatePurchaseOrderStatus(
      orgSlug,
      purchaseOrderId,
      status,
      options
    );
    let accountingEvent: EventoFacturaCompra | undefined;
    let accountingInformalEntryId: string | undefined;

    if (
      status === "IN_TRANSIT" &&
      (await isAccountingIntegrationEnabled(orgSlug))
    ) {
      const purchaseWithItems = await getPurchaseOrderWithItems(
        orgSlug,
        purchaseOrderId
      );
      accountingEvent = buildFacturaCompra(purchaseWithItems);
      accountingInformalEntryId = await createInformalEntry(
        accountingEvent,
        "COMPRA"
      );

      const supabase = await createClient();
      await supabase
        .from("purchase_orders")
        .update({
          accounting_informal_entry_id: accountingInformalEntryId,
        } as never)
        .eq("id", purchaseOrderId)
        .eq("organization_id", purchaseOrder.organization_id);
    }

    revalidatePath(`/org/${orgSlug}/compras`);
    revalidatePath(`/org/${orgSlug}/compras/${purchaseOrderId}`);

    return {
      success: true,
      data: purchaseOrder,
      accountingEvent,
      accountingInformalEntryId,
    };
  } catch (error) {
    console.error("Error updating purchase order status:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar el estado de la compra",
    };
  }
}

export async function markPurchaseAccountingJournalAction(input: {
  orgSlug: string;
  purchaseOrderId: string;
  journalEntryId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ accounting_journal_entry_id: input.journalEntryId } as never)
    .eq("id", input.purchaseOrderId)
    .eq("organization_id", org.id);

  if (error) {
    return {
      success: false,
      error: `No se pudo vincular el asiento formal: ${error.message}`,
    };
  }

  revalidatePath(`/org/${input.orgSlug}/compras`);
  revalidatePath(`/org/${input.orgSlug}/compras/${input.purchaseOrderId}`);

  return { success: true };
}
