"use server";

import { requireAuth } from "@/lib/supabase/auth";
import { assignCustomerToSalesListService } from "../service/assign-customer.service";

export type AssignCustomerToSalesListResult = {
  success: boolean;
  error?: string;
};

export async function assignCustomerToSalesList(input: {
  orgSlug: string;
  listId: string;
  customerId: string;
}): Promise<AssignCustomerToSalesListResult> {
  try {
    await requireAuth();
    const result = await assignCustomerToSalesListService({
      listId: input.listId,
      customerId: input.customerId,
    });
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al asignar el cliente",
    };
  }
}
