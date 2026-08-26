import { truncateMoney } from "@/lib/decimal";
import type { RemittanceData } from "./remittance-generator.service";

export const REMITTANCE_MASK_ITEMS_PER_PAGE = 26;

export type RemittanceMaskData = {
  documentNumber: string;
  date: string;
  customer: {
    businessName: string;
    address?: string | null;
    cuit?: string | null;
    taxCondition?: string | null;
  };
  carrierName?: string | null;
  items: Array<{
    quantity: number;
    description: string;
  }>;
  packageCount: number;
  purchaseOrderNumber?: string | null;
  declaredValue: number;
};

const escapeHtml = (value: string | null | undefined): string =>
  (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatQuantity = (quantity: number): string =>
  new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
  }).format(quantity);

const formatDeclaredValue = (value: number): string =>
  new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);

function dateParts(date: string): { day: string; month: string; year: string } {
  const [year = "", month = "", day = ""] = date.slice(0, 10).split("-");

  return {
    day: day || "-",
    month: month || "-",
    year: year || "-",
  };
}

function chunkItems<T>(items: T[]): T[][] {
  if (items.length === 0) {
    return [[]];
  }

  const pages: T[][] = [];
  for (
    let index = 0;
    index < items.length;
    index += REMITTANCE_MASK_ITEMS_PER_PAGE
  ) {
    pages.push(items.slice(index, index + REMITTANCE_MASK_ITEMS_PER_PAGE));
  }
  return pages;
}

/**
 * Adapts the existing remittance payload to the fields available on the
 * preprinted Roble remittance form. Fields without a source in Rhino
 * deliberately stay blank in the printed mask.
 */
export function buildRemittanceMaskData(
  remittance: RemittanceData,
  options?: {
    carrierName?: string | null;
    purchaseOrderNumber?: string | null;
    packageCount?: number | null;
    declaredValue?: number | null;
  }
): RemittanceMaskData {
  return {
    documentNumber: remittance.documentNumber ?? "",
    date: remittance.date,
    customer: {
      businessName: remittance.customer.businessName,
      address: remittance.customer.address,
      cuit: remittance.customer.cuit,
      taxCondition: remittance.customer.taxCondition,
    },
    carrierName: options?.carrierName,
    items: remittance.items.map((item) => ({
      quantity: item.quantity,
      description: [item.name, item.brand].filter(Boolean).join(" "),
    })),
    packageCount:
      options?.packageCount ??
      remittance.items.reduce((total, item) => total + item.quantity, 0),
    purchaseOrderNumber: options?.purchaseOrderNumber?.trim() || null,
    declaredValue:
      options?.declaredValue ?? truncateMoney(remittance.total * 0.7),
  };
}

/**
 * Generates a transparent A4 overlay for the preprinted remittance form.
 * Coordinates use the rendered 6089 sample as reference and must be printed
 * at actual size, without browser margins or headers/footers.
 */
export function generateRemittanceMaskHTML(data: RemittanceMaskData): string {
  const pages = chunkItems(data.items);
  const date = dateParts(data.date);

  const pageHtml = pages
    .map((items, pageIndex) => {
      const pageLabel =
        pages.length > 1 ? `Hoja ${pageIndex + 1} de ${pages.length}` : "";
      const itemHtml = items
        .map(
          (item, itemIndex) => `
            <div class="line-item" style="top:${99.6 + itemIndex * 5.15}mm">
              <span class="item-quantity">${escapeHtml(formatQuantity(item.quantity))}</span>
              <span class="item-description">${escapeHtml(item.description)}</span>
            </div>`
        )
        .join("");

      return `
        <section class="mask-page">
          <div class="field document-number">${escapeHtml(data.documentNumber)}</div>
          <div class="field date-day">${escapeHtml(date.day)}</div>
          <div class="field date-month">${escapeHtml(date.month)}</div>
          <div class="field date-year">${escapeHtml(date.year)}</div>

          <div class="field customer-name">${escapeHtml(data.customer.businessName)}</div>
          <div class="field customer-address">${escapeHtml(data.customer.address)}</div>
          <div class="field carrier-name">${escapeHtml(data.carrierName)}</div>
          <div class="field tax-condition">${escapeHtml(data.customer.taxCondition)}</div>
          <div class="field customer-cuit">${escapeHtml(data.customer.cuit)}</div>
          ${itemHtml}
          <div class="field page-label">${escapeHtml(pageLabel)}</div>
          <div class="field package-count"><strong>BULTOS:</strong> ${escapeHtml(formatQuantity(data.packageCount))}</div>
          <div class="field purchase-order"><strong>O.C.:</strong> ${escapeHtml(data.purchaseOrderNumber)}</div>
          <div class="field declared-value"><strong>V.D.:</strong> ${escapeHtml(formatDeclaredValue(data.declaredValue))}</div>
        </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Máscara de remito ${escapeHtml(data.documentNumber)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: transparent; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; }
  .mask-page {
    position: relative;
    width: 210mm;
    height: 297mm;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
  }
  .mask-page:last-child { break-after: auto; page-break-after: auto; }
  .field, .line-item { position: absolute; white-space: nowrap; }
  .document-number { left: 135.5mm; top: 41.4mm; font-size: 3.3mm; font-weight: 700; }
  .date-day { left: 131.7mm; top: 47.6mm; font-size: 3.8mm; font-weight: 700; }
  .date-month { left: 149.4mm; top: 47.6mm; font-size: 3.8mm; font-weight: 700; }
  .date-year { left: 164mm; top: 47.6mm; font-size: 3.8mm; font-weight: 700; }
  .customer-name { left: 32.1mm; top: 72.9mm; max-width: 91mm; overflow: hidden; text-overflow: clip; font-size: 3.4mm; font-weight: 700; }
  .customer-address { left: 34.2mm; top: 78.2mm; max-width: 88mm; overflow: hidden; text-overflow: clip; font-size: 3.4mm; font-weight: 700; }
  .carrier-name { left: 33mm; top: 85.1mm; max-width: 88mm; overflow: hidden; text-overflow: clip; font-size: 3.2mm; font-weight: 700; }
  .tax-condition { left: 134mm; top: 71.4mm; max-width: 61mm; overflow: hidden; text-overflow: clip; font-size: 3.4mm; font-weight: 700; }
  .customer-cuit { left: 146mm; top: 78.2mm; max-width: 48mm; overflow: hidden; text-overflow: clip; font-size: 3.4mm; font-weight: 700; }
  .line-item { left: 30mm; right: 20mm; height: 4.5mm; font-size: 3.3mm; line-height: 4.5mm; }
  .item-quantity { display: inline-block; width: 21.5mm; }
  .item-description { display: inline-block; max-width: 126mm; overflow: hidden; text-overflow: clip; vertical-align: top; }
  .page-label { left: 164mm; top: 94.8mm; font-size: 2.5mm; }
  .package-count { left: 28.5mm; top: 253.8mm; font-size: 3.2mm; }
  .purchase-order { left: 76.5mm; top: 253.8mm; max-width: 45mm; overflow: hidden; text-overflow: clip; font-size: 3.2mm; }
  .declared-value { left: 127.5mm; top: 253.8mm; font-size: 3.2mm; }
  @media print {
    html, body { width: 210mm; }
    .mask-page { margin: 0; }
  }
</style>
</head>
<body>${pageHtml}</body>
</html>`;
}
