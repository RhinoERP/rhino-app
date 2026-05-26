"use server";

import { getOrdersByOrg } from "../service/orders.service";
import type { OrderWithDetails } from "../types";

export async function getOrdersAction(
  orgSlug: string
): Promise<OrderWithDetails[]> {
  return await getOrdersByOrg(orgSlug);
}
