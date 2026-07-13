"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createChildOrderNotifications } from "@/modules/notifications/service/notifications.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  createChildOrder,
  groupQuoteItemsBySupplier,
} from "../service/orders.service";
import type { ChildOrderRoute } from "../types";

export type CreateChildOrderInput = {
  orgSlug: string;
  parentOrderId: string;
  quoteItemIds: string[];
  route: ChildOrderRoute;
  sourceChildOrderId?: string;
  observations?: string | null;
  skipParentRecalc?: boolean;
};

export type CreateChildOrderResult = {
  success: boolean;
  childOrderId?: string;
  childOrderNumber?: string;
  childOrders?: Array<{ childOrderId: string; childOrderNumber: string }>;
  supplierCount?: number;
  error?: string;
};

export async function createChildOrderAction(
  input: CreateChildOrderInput
): Promise<CreateChildOrderResult> {
  try {
    const { orgSlug } = input;
    await guardOrganizationPermissionAccess(orgSlug, [
      "orders.stock_review",
      "orders.production",
      "orders.dispatch",
    ]);
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

    if (input.route === "purchase") {
      const groups = await groupQuoteItemsBySupplier(input.quoteItemIds);

      if (groups.size > 1) {
        const childOrders: Array<{
          childOrderId: string;
          childOrderNumber: string;
        }> = [];

        for (const [_supplierId, itemIds] of groups) {
          const result = await createChildOrder({
            ...input,
            quoteItemIds: itemIds,
          });
          childOrders.push({
            childOrderId: result.childOrderId,
            childOrderNumber: result.childOrderNumber,
          });
        }

        revalidatePath(`/org/${orgSlug}/pedidos`);
        revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);
        revalidatePath(`/org/${orgSlug}/pedidos/${input.parentOrderId}`);
        revalidatePath(`/org/${orgSlug}/compras`);

        return {
          success: true,
          childOrders,
          supplierCount: groups.size,
        };
      }
    }

    const result = await createChildOrder(input);

    revalidatePath(`/org/${orgSlug}/pedidos`);
    revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);
    revalidatePath(`/org/${orgSlug}/pedidos/${input.parentOrderId}`);

    if (input.route === "purchase") {
      revalidatePath(`/org/${orgSlug}/compras`);
    }

    const changedByName =
      (user.user_metadata?.full_name as string | undefined) ??
      user.email ??
      "Usuario";

    const childStatusMap: Record<string, string> = {
      direct: "PREPARING",
      production: "IN_PRODUCTION",
      purchase: "PURCHASE_REQUIRED",
    };

    createChildOrderNotifications({
      orgSlug,
      orgId: org.id,
      orderId: result.childOrderId,
      orderNumber: result.childOrderNumber,
      status: childStatusMap[input.route] ?? "PENDING_STOCK",
      route: input.route,
      isChild: true,
      changedByUserId: user.id,
      changedByName,
    }).catch(console.error);

    return {
      success: true,
      childOrderId: result.childOrderId,
      childOrderNumber: result.childOrderNumber,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}
