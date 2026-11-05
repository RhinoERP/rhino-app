"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export type ReviewSalesQuoteRequestInput = {
  orgSlug: string;
  requestId: string;
  decision: "APPROVED" | "RETURNED";
  comment: string;
};

export type ReviewSalesQuoteRequestResult =
  | { success: true }
  | { success: false; error: string };

export async function reviewSalesQuoteRequestAction(
  input: ReviewSalesQuoteRequestInput
): Promise<ReviewSalesQuoteRequestResult> {
  try {
    await ensure("organization.admin", input.orgSlug);
    const supabase = createClient() as unknown as Promise<{
      rpc(
        name: string,
        args: Record<string, unknown>
      ): Promise<{ error: { message: string } | null }>;
    }>;
    const client = await supabase;
    const { error } = await client.rpc("review_sales_quote_request", {
      p_request_id: input.requestId,
      p_decision: input.decision,
      p_comment: input.comment.trim() || null,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/org/${input.orgSlug}/solicitudes-venta/aprobacion`);
    revalidatePath(`/org/${input.orgSlug}/solicitudes-venta`);
    revalidatePath(`/org/${input.orgSlug}/ventas`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo revisar la solicitud de venta",
    };
  }
}
