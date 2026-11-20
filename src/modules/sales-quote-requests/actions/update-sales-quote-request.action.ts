"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/supabase/auth";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type CreateSalesQuoteRequestInput,
  updateSalesQuoteRequest,
} from "../service/sales-quote-requests.service";

export type UpdateSalesQuoteRequestResult =
  | { success: true }
  | { success: false; error: string };

export async function updateSalesQuoteRequestAction(input: {
  requestId: string;
  values: CreateSalesQuoteRequestInput;
}): Promise<UpdateSalesQuoteRequestResult> {
  try {
    await ensure(["sales.manage", "sales.manage.all"], input.values.orgSlug);
    const auth = await requireAuth();
    if (!auth) {
      return { success: false, error: "No autorizado" };
    }

    await updateSalesQuoteRequest(input.requestId, input.values, auth.userId);
    revalidatePath(`/org/${input.values.orgSlug}/solicitudes-venta`);
    revalidatePath(`/org/${input.values.orgSlug}/solicitudes-venta/aprobacion`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los cambios de la cotización",
    };
  }
}
