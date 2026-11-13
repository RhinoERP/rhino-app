import "server-only";

import { z } from "zod";
import { createTypedAdminClient as createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { RemittanceData } from "@/modules/sales/service/remittance-generator.service";

const text = z.string().nullable().optional();
export const remittanceHeaderSnapshotSchema = z.object({
  remittance: z.object({
    type: z.enum(["PRESUPUESTO", "REMITO_FINAL"]),
    date: z.string(),
    currency: z.string().optional(),
    invoiceNumber: text,
    issuer: z.object({
      businessName: z.string(),
      cuit: text,
      legalAddress: text,
      logoUrl: text,
    }),
    customer: z.object({
      businessName: z.string(),
      fantasyName: text,
      cuit: text,
      phone: text,
      address: text,
      taxCondition: text,
    }),
    seller: z.object({ name: z.string(), email: z.string().optional() }),
    taxesTotal: z.number(),
    observations: text,
    singlePageDuplicate: z.boolean().optional(),
    showProductBrand: z.boolean().optional(),
    finalRemittanceVisibility: z
      .object({
        showSku: z.boolean(),
        showWeight: z.boolean(),
        showUnitPrice: z.boolean(),
        showDiscount: z.boolean(),
        showLineTotal: z.boolean(),
        showTotal: z.boolean(),
      })
      .optional(),
  }),
  carrierName: text,
  purchaseOrderNumber: text,
});
const extrasSchema = z.array(
  z.object({ description: z.string(), unitPrice: z.number().finite() })
);

export async function loadSavedRemittances(
  orgSlug: string,
  documentIds: string[]
) {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }
  const supabase = await createClient();
  const result = await supabase
    .from("order_remittances")
    .select(
      "*, lines:order_remittance_lines(*, sources:order_remittance_line_sources(*))"
    )
    .eq("organization_id", org.id)
    .in("id", documentIds)
    .order("created_at")
    .order("batch_id")
    .order("document_position");
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (result.data.length !== new Set(documentIds).size) {
    throw new Error("Uno o más remitos no están disponibles.");
  }
  return result.data;
}

export type SavedOrderRemittance = Awaited<
  ReturnType<typeof loadSavedRemittances>
>[number];

export async function persistSavedRemittancePdf(
  orgSlug: string,
  documentId: string,
  url: string
) {
  const [document] = await loadSavedRemittances(orgSlug, [documentId]);
  const result = await createAdminClient()
    .from("order_remittances")
    .update({ pdf_url: url })
    .eq("organization_id", document.organization_id)
    .eq("id", document.id);
  if (result.error) {
    throw new Error(result.error.message);
  }
}

export function savedRemittanceData(document: SavedOrderRemittance): {
  remittance: RemittanceData;
  carrierName: string | null;
  purchaseOrderNumber: string | null;
  orderNumber: string;
  documentId: string;
} {
  if (document.status !== "ISSUED") {
    throw new Error("El remito está anulado.");
  }
  const snapshot = remittanceHeaderSnapshotSchema.parse(
    document.header_snapshot
  );
  const lines = [...document.lines].sort(
    (a, b) => a.line_position - b.line_position
  );
  if (!lines.length || lines.length > 26) {
    throw new Error("El detalle guardado del remito es inválido.");
  }
  return {
    documentId: document.id,
    orderNumber: document.document_number,
    carrierName: snapshot.carrierName ?? null,
    purchaseOrderNumber: snapshot.purchaseOrderNumber ?? null,
    remittance: {
      ...snapshot.remittance,
      documentNumber: document.document_number,
      date: document.issue_date,
      currency: document.currency,
      subtotal: document.subtotal,
      discountTotal: document.discount_total,
      total: document.total,
      items: lines.map((line) => ({
        sku: line.sku,
        name: line.product_name,
        brand: line.brand,
        variantName: line.variant_name,
        unitOfMeasure: line.unit_of_measure,
        quantity: line.quantity,
        weightQuantity: line.weight_quantity,
        unitPrice: line.unit_price,
        subtotal: line.subtotal,
        discountPercentage: line.discount_percentage,
        extras: extrasSchema.parse(line.extras_snapshot),
      })),
    },
  };
}

/** Uses authenticated RLS and verifies the requested order actually contributes. */
export async function findSavedRemittance(
  orgSlug: string,
  orderIds: string[],
  number: string
): Promise<SavedOrderRemittance | null> {
  if (!number.trim()) {
    return null;
  }
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }
  const supabase = await createClient();
  const result = await supabase
    .from("order_remittances")
    .select("id")
    .eq("organization_id", org.id)
    .eq("document_number", number)
    .maybeSingle();
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.data) {
    return null;
  }
  const [document] = await loadSavedRemittances(orgSlug, [result.data.id]);
  if (
    !document.lines.some((line) =>
      line.sources.some((source) => orderIds.includes(source.order_id))
    )
  ) {
    throw new Error("El remito no pertenece a los subpedidos solicitados.");
  }
  return document;
}

export async function listSavedOrderRemittances(
  orgSlug: string,
  parentOrderId: string
) {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }
  const supabase = await createClient();
  const batches = await supabase
    .from("order_remittance_batches")
    .select("id")
    .eq("organization_id", org.id)
    .eq("parent_order_id", parentOrderId);
  if (batches.error) {
    throw new Error(batches.error.message);
  }
  if (!batches.data.length) {
    return [];
  }
  const documents = await supabase
    .from("order_remittances")
    .select("id")
    .eq("organization_id", org.id)
    .in(
      "batch_id",
      batches.data.map((batch) => batch.id)
    );
  if (documents.error) {
    throw new Error(documents.error.message);
  }
  if (!documents.data.length) {
    return [];
  }
  return loadSavedRemittances(
    orgSlug,
    documents.data.map((document) => document.id)
  );
}
