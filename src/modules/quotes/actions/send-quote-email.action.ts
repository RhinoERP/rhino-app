"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { sendQuoteEmail } from "../service/send-quote-email.service";

export async function sendQuoteEmailAction(input: {
  orgSlug: string;
  quoteId: string;
  recipientEmail: string;
  recipientName: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  await ensure("quotes.manage", input.orgSlug);
  try {
    const result = await sendQuoteEmail(input);

    revalidatePath(`/org/${input.orgSlug}/listas-de-presupuestos`);
    revalidatePath(
      `/org/${input.orgSlug}/presupuestos/${input.quoteId}/editar`
    );

    return result;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al enviar el email",
    };
  }
}
