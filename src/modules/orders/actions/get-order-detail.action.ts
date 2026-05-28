"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { getOrderById } from "../service/orders.service";
import type { OrderWithHistory } from "../types";

export async function getOrderDetailAction(
  orgSlug: string,
  orderId: string
): Promise<OrderWithHistory | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("No autorizado");
  }
  return await getOrderById(orgSlug, orderId);
}
