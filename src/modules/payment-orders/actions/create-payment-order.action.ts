"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/supabase/admin";
import { createPaymentOrder } from "../service/payment-orders.service";
import type { CreatePaymentOrderInput } from "../types";

type Result = { success: boolean; error?: string; paymentOrderId?: string };

export async function createPaymentOrderAction(
  input: CreatePaymentOrderInput
): Promise<Result> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    const { paymentOrderId } = await createPaymentOrder(input);

    revalidatePath(`/org/${input.orgSlug}/compras`);

    return { success: true, paymentOrderId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
