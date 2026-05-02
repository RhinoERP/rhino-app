"use server";

import type { UpdateCarrierInput } from "../service/carriers.service";
import { updateCarrierById } from "../service/carriers.service";

type UpdateCarrierResult =
  | { success: true }
  | { success: false; error: string };

export async function updateCarrierAction(
  input: UpdateCarrierInput
): Promise<UpdateCarrierResult> {
  try {
    await updateCarrierById(input);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar el transporte",
    };
  }
}
