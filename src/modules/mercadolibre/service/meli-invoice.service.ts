import "server-only";

import { z } from "zod";
import { createTypedAdminClient } from "@/lib/supabase/admin-client";
import { toArcaUserMessage } from "@/modules/arca/errors";
import {
  type FiscalInvoicePrintableSale,
  generateFiscalInvoiceHtml,
} from "@/modules/arca/server/fiscal-invoice-pdf.service";
import { paginateFiscalInvoiceHtml } from "@/modules/arca/server/html-to-pdf.service";
import { getOrganizationArcaSettingsByOrganizationId } from "@/modules/arca/server/repository";
import { emitSaleInvoice } from "@/modules/arca/server/sale-invoicing.service";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import {
  getOrganizationBySlug,
  getOrganizationLayoutData,
} from "@/modules/organizations/service/organizations.service";
import { meliReceiverSchema } from "../types";
import { readMeliLineSnapshots } from "../utils/line-snapshots";
import { sumMeliMoney } from "../utils/money";
import { resolveMeliFiscalReceiver } from "./meli-fiscal-receiver";
import { getMeliSale } from "./meli-read.service";

export function emitMercadoLibreInvoice(orgSlug: string, saleId: string) {
  z.uuid().parse(saleId);
  return emitSaleInvoice({ orgSlug, saleId, salesChannel: "MERCADO_LIBRE" });
}

/** A fiscal failure must never turn a completed commercial sale into a failed checkout. */
export async function tryAutomaticMeliInvoice(
  orgSlug: string,
  saleId: string
): Promise<string | null> {
  try {
    const layout = await getOrganizationLayoutData(orgSlug);
    if (
      !layout?.permissions.some(
        (permission) =>
          permission === "organization.admin" ||
          permission === "mercadolibre.invoice"
      )
    ) {
      return null;
    }
    await emitMercadoLibreInvoice(orgSlug, saleId);
    return null;
  } catch (error) {
    return toArcaUserMessage(error);
  }
}

export async function generateMeliInvoiceHtml(orgSlug: string, saleId: string) {
  const scopedSale = await getMeliSale(orgSlug, saleId);
  if (!scopedSale) {
    throw new Error("Venta Meli no encontrada o fuera de tus depósitos.");
  }
  if (scopedSale.arca_status !== "authorized") {
    throw new Error("La factura todavía no está autorizada por ARCA.");
  }
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }
  const admin = createTypedAdminClient();
  const result = await admin
    .from("sales_orders")
    .select(
      "*, items:sales_order_items(*, product:products(name, sku, unit_of_measure, tracks_stock_units), variant:product_variants(talle, color)), taxes:sales_order_taxes(*)"
    )
    .eq("organization_id", org.id)
    .eq("sales_channel", "MERCADO_LIBRE")
    .eq("id", saleId)
    .eq("warehouse_id", scopedSale.warehouse_id)
    .eq("items.organization_id", org.id)
    .eq("taxes.organization_id", org.id)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new Error("No se pudo cargar el comprobante Meli.");
  }
  const row = result.data;
  const lineSnapshots = readMeliLineSnapshots(row.commercial_snapshot);
  const receiver = resolveMeliFiscalReceiver(
    meliReceiverSchema.parse(row.fiscal_receiver_snapshot),
    row.customer_id
  );
  const sale: FiscalInvoicePrintableSale = {
    ...row,
    sub_total: sumMeliMoney(row.items.map((item) => item.subtotal)),
    receiverDocument: receiver.document,
    customer: {
      business_name: receiver.businessName,
      fantasy_name: null,
      cuit: receiver.cuit,
      tax_condition: receiver.taxCondition,
      address: receiver.address,
      city: null,
    },
    seller: null,
    items: row.items.map((item) => {
      const snapshot = lineSnapshots?.[item.id];
      if (lineSnapshots && !snapshot) {
        throw new Error("Falta el snapshot de una línea del comprobante Meli.");
      }
      return {
        id: item.id,
        type: "product",
        productId: item.product_id,
        productVariantId: item.product_variant_id,
        productVariantName:
          !snapshot && item.variant
            ? [item.variant.talle, item.variant.color]
                .filter(Boolean)
                .join(" / ")
            : null,
        description: snapshot?.name ?? item.description,
        name:
          snapshot?.name ??
          item.description ??
          item.product?.name ??
          "Producto",
        sku: snapshot?.sku ?? item.product?.sku ?? "",
        brand: snapshot?.brand,
        quantity: item.quantity,
        weightQuantity: item.unit_quantity,
        unitPrice: item.unit_price,
        basePrice: item.base_price,
        discountPercent: item.discount_percentage ?? 0,
        subtotal: item.subtotal,
        unitOfMeasure:
          snapshot?.unit_of_measure ?? item.product?.unit_of_measure ?? "UN",
        tracksStockUnits:
          snapshot?.tracks_stock_units ??
          Boolean(item.product?.tracks_stock_units),
        averageQuantityPerUnit: null,
      };
    }),
    taxes: row.taxes.map((tax) => {
      if (!tax.tax_id) {
        throw new Error(
          "El comprobante tiene un impuesto sin referencia fiscal válida."
        );
      }
      return {
        id: tax.id,
        taxId: tax.tax_id,
        name: tax.name,
        rate: tax.rate,
        baseAmount: tax.base_amount,
        taxAmount: tax.tax_amount,
        taxCodeSnapshot: tax.tax_code_snapshot,
      };
    }),
  };
  const [settings, orgSettings] = await Promise.all([
    getOrganizationArcaSettingsByOrganizationId(org.id, "system"),
    getOrgSettings(orgSlug),
  ]);
  const html = await generateFiscalInvoiceHtml({
    sale,
    organization: org,
    branding: {
      issuerBusinessName: settings?.issuer_business_name ?? null,
      issuerLogoUrl: settings?.issuer_logo_data_url ?? null,
      issuerLegalAddress: settings?.issuer_legal_address ?? null,
    },
    orderQuotePaymentCondition: "Mercado Libre",
    printDuplicate: orgSettings.invoice_print_duplicate,
  });
  return {
    html: await paginateFiscalInvoiceHtml(html),
    filename: `Factura_Meli_${(row.invoice_number ?? String(row.sale_number ?? row.id)).replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`,
  };
}
