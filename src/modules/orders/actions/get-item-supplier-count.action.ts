"use server";

import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { groupQuoteItemsBySupplier } from "../service/orders.service";

export async function getItemSupplierCountAction(
  orgSlug: string,
  quoteItemIds: string[]
): Promise<number> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id || quoteItemIds.length === 0) {
    return 0;
  }

  const groups = await groupQuoteItemsBySupplier(quoteItemIds);
  return groups.size;
}
