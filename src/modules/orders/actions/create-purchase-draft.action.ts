"use server";

import { createClient } from "@/lib/supabase/server";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { createDraftPurchaseFromChildOrder } from "@/modules/purchases/service/purchases.service";

export type CreatePurchaseDraftResult = {
  success: boolean;
  error?: string;
};

export async function createPurchaseDraftAction(
  orgSlug: string,
  orderId: string,
  quoteItemIds: string[]
): Promise<CreatePurchaseDraftResult> {
  try {
    await guardOrganizationPermissionAccess(orgSlug, "orders.stock_review");
    const supabase = await createClient();
    const org = await getOrganizationBySlug(orgSlug);

    if (!org?.id) {
      throw new Error("Organización no encontrada");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("No autorizado");
    }

    await createDraftPurchaseFromChildOrder({
      orgId: org.id,
      orderId,
      quoteItemIds,
    });

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}
