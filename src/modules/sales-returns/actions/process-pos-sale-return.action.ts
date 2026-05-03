"use server";

import { revalidatePath } from "next/cache";
import { processPosSaleReturn } from "@/modules/sales-returns/service/sales-returns.service";
import {
  type ProcessPosSaleReturnInput,
  type ProcessPosSaleReturnResult,
  processPosSaleReturnSchema,
} from "../types";

export type ProcessPosSaleReturnActionResult = {
  success: boolean;
  data?: ProcessPosSaleReturnResult;
  error?: string;
};

export async function processPosSaleReturnAction(
  input: ProcessPosSaleReturnInput
): Promise<ProcessPosSaleReturnActionResult> {
  const parsed = processPosSaleReturnSchema.safeParse(input);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    return {
      success: false,
      error: issue?.message ?? "Datos inválidos para procesar la devolución.",
    };
  }

  try {
    const result = await processPosSaleReturn(parsed.data);

    revalidatePath(`/org/${parsed.data.orgSlug}/venta-directa`);
    revalidatePath(`/org/${parsed.data.orgSlug}/venta-directa/nueva`);
    revalidatePath(`/org/${parsed.data.orgSlug}/cobranzas`);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error processing POS sale return:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al procesar la devolución POS.",
    };
  }
}
