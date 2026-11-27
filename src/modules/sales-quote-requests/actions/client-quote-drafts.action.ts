"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/supabase/auth";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  convertClientQuoteDraft,
  saveClientQuoteDraft,
} from "../service/client-quote-drafts.service";
import type { CreateSalesQuoteRequestInput } from "../service/sales-quote-requests.service";

export async function saveClientQuoteDraftAction(
  values: CreateSalesQuoteRequestInput,
  draftId?: string
): Promise<
  | { success: true; draftId: string; html: string }
  | { success: false; error: string }
> {
  try {
    await ensure(["sales.manage", "sales.manage.all"], values.orgSlug);
    const auth = await requireAuth();
    if (!auth) {
      return { success: false, error: "No autorizado" };
    }
    const result = await saveClientQuoteDraft(values, auth.userId, draftId);
    revalidatePath(`/org/${values.orgSlug}/solicitudes-venta`);
    return { success: true, draftId: result.id, html: result.html };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo guardar la cotización",
    };
  }
}

export async function convertClientQuoteDraftAction(
  orgSlug: string,
  draftId: string
): Promise<
  { success: true; requestId: string } | { success: false; error: string }
> {
  try {
    await ensure(["sales.manage", "sales.manage.all"], orgSlug);
    const auth = await requireAuth();
    if (!auth) {
      return { success: false, error: "No autorizado" };
    }
    const requestId = await convertClientQuoteDraft(
      orgSlug,
      auth.userId,
      draftId
    );
    revalidatePath(`/org/${orgSlug}/solicitudes-venta`);
    return { success: true, requestId };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo enviar a aprobación",
    };
  }
}
