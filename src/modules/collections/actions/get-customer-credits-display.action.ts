"use server";

import type { CustomerCreditDisplay } from "../service/collections.service";
import { getCustomerCreditsForDisplay } from "../service/collections.service";

export async function getCustomerCreditsDisplayAction(
  orgSlug: string,
  customerId: string
): Promise<CustomerCreditDisplay[]> {
  try {
    return await getCustomerCreditsForDisplay(orgSlug, customerId);
  } catch {
    return [];
  }
}
