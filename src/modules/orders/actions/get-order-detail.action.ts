"use server";

import { getOrderById } from "../service/orders.service";
import type { OrderWithHistory } from "../types";

export async function getOrderDetailAction(
  orgSlug: string,
  orderId: string
): Promise<OrderWithHistory | null> {
  return await getOrderById(orgSlug, orderId);
}
