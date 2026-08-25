"use server";

import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { buildRemittanceFromSale } from "../service/remittance-generator.service";
import {
  buildRemittanceMaskData,
  generateRemittanceMaskHTML,
} from "../service/remittance-mask-generator.service";
import { getSalesOrderById } from "../service/sales.service";

type PreviewRemittanceMaskResult =
  | { success: true; html: string }
  | { success: false; error: string };

/** Returns a printable overlay only; it does not generate or store a PDF. */
export async function previewRemittanceMaskAction(
  orgSlug: string,
  saleId: string,
  purchaseOrderNumber?: string
): Promise<PreviewRemittanceMaskResult> {
  await ensure(["sales.read", "sales.manage"], orgSlug);

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

    const sale = await getSalesOrderById(orgSlug, saleId);

    if (!sale) {
      return { success: false, error: "Venta no encontrada" };
    }
    if (!sale.remittance_number?.trim()) {
      return {
        success: false,
        error:
          "La venta debe tener un número de remito para imprimir la máscara",
      };
    }

    const remittance = buildRemittanceFromSale(sale, "REMITO_FINAL");
    const mask = buildRemittanceMaskData(remittance, {
      carrierName: sale.carrier?.name,
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
