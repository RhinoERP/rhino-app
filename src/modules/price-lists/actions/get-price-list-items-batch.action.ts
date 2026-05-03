"use server";

import {
  getPriceListItemsBatch,
  type PriceListItemBasic,
} from "../service/price-lists.service";

export async function getPriceListItemsBatchAction(
  orgSlug: string,
  priceListIds: string[]
): Promise<Record<string, PriceListItemBasic[]>> {
  try {
    return await getPriceListItemsBatch(orgSlug, priceListIds);
  } catch {
    return {};
  }
}
