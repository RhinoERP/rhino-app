"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  loadSavedRemittances,
  savedRemittanceData,
} from "../server/order-remittance-documents.service";
import {
  confirmPublicRemittanceReceipt,
  createRemittanceReceiptLink,
} from "../server/remittance-receipt.service";

export async function getRemittanceReceiptLinkAction(
  orgSlug: string,
  documentId: string
) {
  try {
    await ensure(["orders.manage", "orders.dispatch"], orgSlug);
    const [document] = await loadSavedRemittances(orgSlug, [documentId]);
    if (!savedRemittanceData(document).remittance.fiscal) {
      throw new Error(
        "La recepción digital se habilita para los remitos con CAI."
      );
    }
    return {
      success: true as const,
      path: await createRemittanceReceiptLink(document),
    };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo generar el enlace.",
    };
  }
}

/** Public server action: the high-entropy link is the only capability granted. */
export async function confirmRemittanceReceiptAction(
  token: string,
  name: string
) {
  try {
    await confirmPublicRemittanceReceipt(token, name);
    revalidatePath(`/remitos/recepcion/${token}`);
    return { success: true as const };
  } catch {
    return {
      success: false as const,
      error:
        "No se pudo confirmar la recepción. Revisá el nombre y que el enlace siga disponible.",
    };
  }
}
