"use server";

import { getAllOrdersForExport } from "@/modules/orders/service/orders-export.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export async function getOrdersExportAction(orgSlug: string) {
  await ensure(
    [
      "orders.read",
      "orders.manage",
      "orders.finance_review",
      "orders.stock_review",
      "orders.production",
      "orders.dispatch",
    ],
    orgSlug
  );
  try {
    return await getAllOrdersForExport(orgSlug);
  } catch (error) {
    console.error("Error in getOrdersExportAction:", error);
    return [];
  }
}
