"use server";

import type { CreateCarrierInput } from "../service/carriers.service";
import { createCarrierForOrg } from "../service/carriers.service";

type CreateCarrierResult =
  | { success: true }
  | { success: false; error: string };

export async function createCarrierAction(
  input: CreateCarrierInput
): Promise<CreateCarrierResult> {
  try {
    await createCarrierForOrg(input);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al crear el transporte",
    };
  }
}
