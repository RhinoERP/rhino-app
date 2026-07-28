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
  quantities?: Record<string, number>;
};

export type CreateChildOrderResult = {
  success: boolean;
  childOrderId?: string;
  childOrderNumber?: string;
  childOrders?: Array<{ childOrderId: string; childOrderNumber: string }>;
  supplierCount?: number;
  error?: string;
};

async function createPurchaseChildOrders(
  input: CreateChildOrderInput,
  orgSlug: string,
  orgId: string,
  user: { id: string; user_metadata?: Record<string, unknown>; email?: string }
): Promise<CreateChildOrderResult> {
  const groups = await groupQuoteItemsBySupplier(input.quoteItemIds);

  if (groups.size === 0) {
    return {
      success: false,
      error: "Ninguno de los items seleccionados tiene proveedor asignado.",
    };
  }

  if (groups.size <= 1) {
    return createSingleChildOrder(input, orgSlug, orgId, user);
  }

  const childOrders: Array<{
    childOrderId: string;
    childOrderNumber: string;
  }> = [];

  for (const [_supplierId, itemIds] of groups) {
    const filteredQuantities = input.quantities
      ? Object.fromEntries(
          Object.entries(input.quantities).filter(([id]) =>
            itemIds.includes(id)
          )
        )
      : undefined;
    const result = await createChildOrder({
      ...input,
      quoteItemIds: itemIds,
      quantities: filteredQuantities,
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

async function createSingleChildOrder(
  input: CreateChildOrderInput,
  orgSlug: string,
  orgId: string,
  user: { id: string; user_metadata?: Record<string, unknown>; email?: string }
): Promise<CreateChildOrderResult> {
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
    orgId,
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
}

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
      return createPurchaseChildOrders(input, orgSlug, org.id, user);
    }

    return createSingleChildOrder(input, orgSlug, org.id, user);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}
