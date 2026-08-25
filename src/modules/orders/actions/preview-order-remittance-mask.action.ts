"use server";

import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  buildRemittanceMaskData,
  generateRemittanceMaskHTML,
} from "@/modules/sales/service/remittance-mask-generator.service";
import { getOrderRemittanceData } from "../server/order-remittance-pdf-document.service";

type PreviewOrderRemittanceMaskResult =
  | { success: true; html: string }
  | { success: false; error: string };

/** Returns a printable overlay only; it does not update order events or storage. */
export async function previewOrderRemittanceMaskAction(
  orgSlug: string,
  childOrderId: string,
  remitoNumber: string,
  purchaseOrderNumber?: string
): Promise<PreviewOrderRemittanceMaskResult> {
  await ensure("orders.manage", orgSlug);

  try {
    const settingsResult = await getOrganizationSettings(orgSlug);
    if (
      !(
        settingsResult.success &&
        settingsResult.data?.remittance_mask_printing_enabled
      )
    ) {
      return {
        success: false,
        error:
          "La impresión de máscaras de remito no está habilitada para esta organización",
      };
    }

    if (!remitoNumber.trim()) {
      return {
        success: false,
        error:
          "El pedido debe tener un número de remito para imprimir la máscara",
      };
    }

    const { remittance, carrierName } = await getOrderRemittanceData({
      orgSlug,
      childOrderId,
      remitoNumber,
    });

    const mask = buildRemittanceMaskData(remittance, {
      carrierName,
      purchaseOrderNumber,
    });
    return { success: true, html: generateRemittanceMaskHTML(mask) };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo generar la máscara de remito",
    };
  }
}
