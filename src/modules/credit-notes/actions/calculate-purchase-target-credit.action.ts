"use server";

import {
  type CalculatePurchaseTargetCreditInput,
  type CalculatePurchaseTargetCreditResult,
  calculatePurchaseTargetCredit,
} from "../service/purchase-target-credit.service";

type ActionResult =
  | { success: true; data: CalculatePurchaseTargetCreditResult }
  | { success: false; error: string };

export async function calculatePurchaseTargetCreditAction(
  input: CalculatePurchaseTargetCreditInput
): Promise<ActionResult> {
  try {
    const data = await calculatePurchaseTargetCredit(input);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo calcular el objetivo de compra",
    };
  }
}
