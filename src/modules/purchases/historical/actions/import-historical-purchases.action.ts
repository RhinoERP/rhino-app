"use server";

import { revalidatePath } from "next/cache";
import { importHistoricalPurchasesSchema } from "../schemas";
import { importHistoricalPurchasesForOrg } from "../service/historical-purchases.service";
import type {
  ImportHistoricalPurchasesInput,
  ImportHistoricalPurchasesResult,
} from "../types";

export async function importHistoricalPurchasesAction(
  input: ImportHistoricalPurchasesInput
): Promise<ImportHistoricalPurchasesResult> {
  try {
    // Validate input
    const validation = importHistoricalPurchasesSchema.safeParse({
      data: input.data,
    });

    if (!validation.success) {
      return {
        success: false,
        message: "Datos inválidos",
        errors: validation.error.issues.map((issue) => issue.message),
      };
    }

    // Import data
    const result = await importHistoricalPurchasesForOrg(
      input.orgSlug,
      input.data
    );

    // Revalidate dashboard to show new data
    revalidatePath(`/org/${input.orgSlug}/dashboard`);

    if (result.errors.length > 0) {
      return {
        success: false,
        message: `Se procesaron ${result.imported + result.updated} registros con ${result.errors.length} errores`,
        imported: result.imported,
        updated: result.updated,
        errors: result.errors,
      };
    }

    return {
      success: true,
      message: `Se importaron ${result.imported} y se actualizaron ${result.updated} registros históricos correctamente`,
      imported: result.imported,
      updated: result.updated,
    };
  } catch (error) {
    console.error("Error importing historical purchases:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Error desconocido al importar compras históricas",
    };
  }
}
