"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { updateQuote } from "../service/quotes.service";

type FileField = "purchaseOrderFile" | "designFileUrl";

export async function updateQuoteFileAction(
  orgSlug: string,
  quoteId: string,
  field: FileField,
  url: string | null
): Promise<{ success: boolean; error?: string }> {
  await ensure("quotes.manage", orgSlug);
  try {
    await updateQuote(quoteId, { orgSlug, [field]: url });

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
