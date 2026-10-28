"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/supabase/auth";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type CreateSalesQuoteRequestInput,
  createSalesQuoteRequest,
} from "../service/sales-quote-requests.service";

export type CreateSalesQuoteRequestResult =
  | { success: true; requestId: string }
  | { success: false; error: string };

export async function createSalesQuoteRequestAction(
  input: CreateSalesQuoteRequestInput
): Promise<CreateSalesQuoteRequestResult> {
  try {
    await ensure(["sales.manage", "sales.manage.all"], input.orgSlug);
    const auth = await requireAuth();
    if (!auth) {
      return { success: false, error: "No autorizado" };
    }

    const requestId = await createSalesQuoteRequest(input, auth.userId);
    revalidatePath(`/org/${input.orgSlug}/solicitudes-venta/nueva`);

    return { success: true, requestId };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo enviar la solicitud de venta",
    };
  }
}
