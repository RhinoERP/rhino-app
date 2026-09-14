"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/supabase/auth";
import { upsertSupplierCommissionRate } from "../service/supplier-commission-rates.service";

export type UpsertSupplierCommissionRateActionResult = {
  success: boolean;
  error?: string;
};

export async function upsertSupplierCommissionRateAction(
  orgSlug: string,
  sellerId: string,
  supplierId: string,
  rate: number
): Promise<UpsertSupplierCommissionRateActionResult> {
  try {
    await requireAuth();
    await upsertSupplierCommissionRate(orgSlug, sellerId, supplierId, rate);

    revalidatePath(`/org/${orgSlug}/comisiones/proveedores`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error guardando comisión por proveedor",
    };
  }
}
