"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { getOrdersByOrg } from "../service/orders.service";
import type { OrderWithDetails } from "../types";

export async function getOrdersAction(
  orgSlug: string
): Promise<OrderWithDetails[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("No autorizado");
  }
  return await getOrdersByOrg(orgSlug);
}
