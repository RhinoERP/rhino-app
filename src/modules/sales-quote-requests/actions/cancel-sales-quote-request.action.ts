"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/supabase/auth";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export type CancelSalesQuoteRequestResult =
  | { success: true }
  | { success: false; error: string };

export async function cancelSalesQuoteRequestAction(input: {
  orgSlug: string;
  requestId: string;
  observation: string;
}): Promise<CancelSalesQuoteRequestResult> {
  try {
    await ensure(["sales.manage", "sales.manage.all"], input.orgSlug);
    const auth = await requireAuth();
    if (!auth) {
      return { success: false, error: "No autorizado" };
    }
    if (!input.observation.trim()) {
      return {
        success: false,
        error: "Ingresá una observación para dar de baja la cotización",
      };
    }

    const { error } = await auth.supabase.rpc(
      "cancel_own_sales_quote_request" as never,
      {
        p_request_id: input.requestId,
        p_observation: input.observation.trim(),
      } as never
    );
    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/org/${input.orgSlug}/solicitudes-venta`);
    revalidatePath(`/org/${input.orgSlug}/solicitudes-venta/aprobacion`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo dar de baja la cotización",
    };
  }
}
