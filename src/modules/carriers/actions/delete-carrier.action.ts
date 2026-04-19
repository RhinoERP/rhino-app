"use server";

import { deactivateCarrierById } from "../service/carriers.service";

type DeleteCarrierResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteCarrierAction(
  carrierId: string
): Promise<DeleteCarrierResult> {
  try {
    await deactivateCarrierById(carrierId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al eliminar el transporte",
    };
  }
}
