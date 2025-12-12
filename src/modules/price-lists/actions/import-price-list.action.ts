"use server";

import { revalidatePath } from "next/cache";
import type { CreatePriceListInput } from "../service/price-lists.service";
import type { ImportPriceListResult } from "../types";

export type ImportPriceListActionResult = {
  success: boolean;
  error?: string;
  data?: ImportPriceListResult;
};

export type ImportPriceListActionParams = Omit<
  CreatePriceListInput,
  "orgSlug"
> & {
  orgSlug: string;
};

export async function importPriceListAction(
  params: ImportPriceListActionParams
): Promise<ImportPriceListActionResult> {
  try {
    // Dynamic import to avoid circular dependencies
    const { importPriceList: importPriceListService } = await import(
      "../service/price-lists.service"
    );

    const result = await importPriceListService(params);

    // Revalidate the price lists page
    revalidatePath(`/org/${params.orgSlug}/compras/listas-de-precios`);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
