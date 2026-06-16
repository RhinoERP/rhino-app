"use server";

import { revalidatePath } from "next/cache";
import { updateQuote } from "../service/quotes.service";

export async function updateQuoteFileAction(
  orgSlug: string,
  quoteId: string,
  purchaseOrderFile: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateQuote(quoteId, { orgSlug, purchaseOrderFile });

    revalidatePath(`/org/${orgSlug}/listas-de-presupuestos`);
    revalidatePath(`/org/${orgSlug}/presupuestos/${quoteId}/editar`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar el archivo",
    };
  }
}
