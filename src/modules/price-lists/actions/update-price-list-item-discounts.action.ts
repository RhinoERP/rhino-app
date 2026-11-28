"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type UpdatePriceListItemDiscountsInput,
  updatePriceListItemDiscounts,
} from "../service/price-lists.service";

export async function updatePriceListItemDiscountsAction(
  input: UpdatePriceListItemDiscountsInput
) {
  await ensure("pricelists.manage", input.orgSlug);
  try {
    await updatePriceListItemDiscounts(input);
    revalidatePath(
      `/org/${input.orgSlug}/precios/listas-de-precios/${input.priceListId}`
    );
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los descuentos",
    };
  }
}
