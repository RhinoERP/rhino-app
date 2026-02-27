"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deletePreSale } from "../service/pre-sale.service";

const deletePreSaleSchema = z.object({
  orgSlug: z.string().trim().min(1, "La organización es requerida"),
  id: z.string().trim().min(1, "El ID de la preventa es requerido"),
});

type DeletePreSaleInput = z.infer<typeof deletePreSaleSchema>;

export type DeletePreSaleActionResult = {
  success: boolean;
  error?: string;
};

export async function deletePreSaleAction(
  input: DeletePreSaleInput
): Promise<DeletePreSaleActionResult> {
  try {
    const parsedInput = deletePreSaleSchema.parse(input);
    await deletePreSale(parsedInput.orgSlug, parsedInput.id);

    revalidatePath(`/org/${parsedInput.orgSlug}/ventas`);
    revalidatePath(`/org/${parsedInput.orgSlug}/cobranzas`);
    revalidatePath(`/org/${parsedInput.orgSlug}/ventas/${parsedInput.id}`);

    return { success: true };
  } catch (error) {
    console.error("Error eliminando preventa:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al eliminar la preventa",
    };
  }
}
