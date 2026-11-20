"use server";

import { z } from "zod";
import { requireCommercialAiAccess } from "../service/commercial-ai.service";
import {
  CreditPurchaseError,
  startCreditPurchase,
} from "../service/credit-purchases.service";

const schema = z.object({
  orgSlug: z.string().min(1),
  packageKey: z.string().min(1).max(40),
});

export type BuyCreditsResult =
  | { success: true; url: string }
  | { success: false; error: string };

/** El gerente elige un paquete: devuelve el link de pago de Mercado Pago. */
export async function buyCreditsAction(
  input: z.infer<typeof schema>
): Promise<BuyCreditsResult> {
  try {
    const data = schema.parse(input);
    const access = await requireCommercialAiAccess(data.orgSlug, "manage");
    const url = await startCreditPurchase({
      organizationId: access.organizationId,
      orgSlug: data.orgSlug,
      packageKey: data.packageKey,
      userId: access.userId,
    });
    return { success: true, url };
  } catch (error) {
    if (!(error instanceof CreditPurchaseError)) {
      console.error("IA Comercial: no se pudo iniciar la compra", error);
    }
    return {
      success: false,
      error:
        error instanceof CreditPurchaseError || error instanceof Error
          ? error.message
          : "No se pudo iniciar la compra",
    };
  }
}
