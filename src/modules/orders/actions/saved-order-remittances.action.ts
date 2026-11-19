"use server";

import { z } from "zod";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  buildRemittanceMaskData,
  generateRemittanceMaskHTML,
} from "@/modules/sales/service/remittance-mask-generator.service";
import {
  listSavedOrderRemittances,
  loadSavedRemittances,
  savedRemittanceData,
} from "../server/order-remittance-documents.service";

export async function getSavedOrderRemittancesAction(
  orgSlug: string,
  parentOrderId: string
) {
  await ensure(READ_PERMISSIONS.orders, orgSlug);
  z.uuid().parse(parentOrderId);
  const documents = await listSavedOrderRemittances(orgSlug, parentOrderId);
  return documents.map((document) => ({
    id: document.id,
    batchId: document.batch_id,
    number: document.document_number,
    position: document.document_position,
    date: document.issue_date,
    status: document.status,
    packageCount: document.package_count,
    declaredValue: document.declared_value,
    total: document.total,
    lineCount: document.lines.length,
    childOrderId:
      document.lines.flatMap((line) => line.sources)[0]?.order_id ?? null,
    orderIds: [
      ...new Set(
        document.lines.flatMap((line) =>
          line.sources.map((source) => source.order_id)
        )
      ),
    ],
    pdfUrl: document.pdf_url,
  }));
}

export async function previewSavedRemittanceMasksAction(
  orgSlug: string,
  documentIds: string[],
  purchaseOrderNumber?: string
) {
  try {
    await ensure(READ_PERMISSIONS.orders, orgSlug);
    const ids = z.array(z.uuid()).min(1).parse(documentIds);
    const settings = await getOrganizationSettings(orgSlug);
    if (
      !(settings.success && settings.data?.remittance_mask_printing_enabled)
    ) {
      throw new Error("La impresión de máscaras no está habilitada.");
    }
    const documents = await loadSavedRemittances(orgSlug, ids);
    const masks = documents.map((document) => {
      const data = savedRemittanceData(document);
      return {
        ...buildRemittanceMaskData(data.remittance, {
          carrierName: data.carrierName,
          purchaseOrderNumber: purchaseOrderNumber || data.purchaseOrderNumber,
        }),
        packageCount: document.package_count,
        declaredValue: document.declared_value,
      };
    });
    return { success: true as const, html: generateRemittanceMaskHTML(masks) };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron preparar las máscaras.",
    };
  }
}
