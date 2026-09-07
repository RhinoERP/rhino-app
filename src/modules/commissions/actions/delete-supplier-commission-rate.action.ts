"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/supabase/auth";
import { deleteSupplierCommissionRate } from "../service/supplier-commission-rates.service";

export type DeleteSupplierCommissionRateActionResult = {
  success: boolean;
  error?: string;
};

export async function deleteSupplierCommissionRateAction(
  orgSlug: string,
  rateId: string
): Promise<DeleteSupplierCommissionRateActionResult> {
  try {
    await requireAuth();
    await deleteSupplierCommissionRate(orgSlug, rateId);

    revalidatePath(`/org/${orgSlug}/comisiones/proveedores`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error eliminando comisión por proveedor",
    };
  }
}
