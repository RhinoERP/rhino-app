import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { SalesOrderDetail } from "./sales.service";

/**
 * Remittance data structure for PDF generation
 */
export type RemittanceData = {
  type: "PRESUPUESTO" | "REMITO_FINAL";
  documentNumber?: string;
  saleNumber?: number | null;
  invoiceNumber?: string | null;
  date: string;
  expirationDate?: string | null;
  customer: {
    businessName: string;
    fantasyName?: string | null;
  };
  seller: {
    name: string;
    email?: string;
  };
  items: Array<{
    sku: string;
    name: string;
    brand?: string | null;
    quantity: number;
    unitOfMeasure: string;
    weightQuantity?: number | null;
    unitPrice: number;
    subtotal: number;
    discountPercentage?: number | null;
  }>;
  subtotal: number;
  taxesTotal: number;
  discountTotal: number;
  total: number;
  observations?: string | null;
};

/**
 * Generates remittance HTML for PDF generation or printing
 */
export function generateRemittanceHTML(data: RemittanceData): string {
  const hasWeight = data.items.some(
    (item) => item.weightQuantity !== undefined && item.weightQuantity !== null
  );
  const hasDiscounts = data.items.some(
    (item) =>
      item.discountPercentage !== undefined && item.discountPercentage !== null
  );

  const itemsHTML = data.items
    .map(
      (item) => `
        <tr>
          <td style="width: 80px;">${item.sku}</td>
          <td>
            <div style="font-weight: bold;">${item.name}</div>
            ${item.brand ? `<div style="font-size: 0.9em; color: #666;">${item.brand}</div>` : ""}
          </td>
          <td style="text-align: right; width: 70px;">${item.quantity}</td>
          <td style="text-align: center; width: 60px;">${item.unitOfMeasure}</td>
          ${hasWeight ? `<td style="text-align: right; width: 80px;">${item.weightQuantity ? item.weightQuantity.toFixed(2) : "-"}</td>` : ""}
          <td style="text-align: right; width: 100px;">${formatCurrency(item.unitPrice)}</td>
          ${hasDiscounts ? `<td style="text-align: right; width: 80px;">${item.discountPercentage ? `${item.discountPercentage.toFixed(1)}%` : "0.0%"}</td>` : ""}
          <td style="text-align: right; width: 110px; font-weight: bold;">${formatCurrency(item.subtotal)}</td>
        </tr>`
    )
    .join("");

  const documentTitle =
    data.type === "PRESUPUESTO" ? "Presupuesto" : "Remito de Venta";
  const documentLabel =
    data.type === "PRESUPUESTO" ? "Presupuesto N°" : "Remito N°";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica', 'Arial', sans-serif;
      padding: 15mm;
      color: #1a1a1a;
      background-color: #ffffff;
      line-height: 1.5;
      font-size: 12px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 15px;
      border-bottom: 2px solid #000;
    }
    .document-info { text-align: right; }
    .customer-section {
      margin-bottom: 30px;
      padding: 15px;
      background-color: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 6px;
    }
    .customer-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    th {
      background-color: #212529;
      color: #ffffff;
      padding: 12px 10px;
      text-align: left;
      font-weight: bold;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
    }
    td {
      border: 1px solid #dee2e6;
      padding: 12px 10px;
      vertical-align: middle;
    }
    .totals-container {
      display: flex;
      justify-content: flex-end;
      margin-top: 10px;
    }
    .totals-table {
      width: 300px;
      margin-left: auto;
    }
    .totals-table td { 
      padding: 8px 12px; 
      border: none; 
      border-bottom: 1px solid #f0f0f0; 
    }
    .total-final {
      font-weight: bold;
      font-size: 1.4em;
      color: #000;
      border-top: 2px solid #000 !important;
      background-color: #f8f9fa;
    }
    .observations {
      margin-top: 30px;
      padding: 15px;
      border-left: 4px solid #212529;
      background-color: #fcfcfc;
      font-size: 11px;
    }
    @page {
      size: A4;
      margin: 0;
    }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 style="font-size: 28px; margin-bottom: 8px; color: #000;">${documentTitle}</h1>
      <p style="font-size: 13px;"><strong>Vendedor:</strong> ${data.seller.name}</p>
      ${data.seller.email ? `<p style="color: #444;">${data.seller.email}</p>` : ""}
    </div>
    <div class="document-info">
      <p style="font-size: 18px; color: #000; margin-bottom: 5px;"><strong>${documentLabel}</strong> ${data.saleNumber || data.documentNumber || "—"}</p>
      <p><strong>Fecha:</strong> ${formatDateOnly(data.date)}</p>
      ${data.expirationDate ? `<p><strong>Vencimiento:</strong> ${formatDateOnly(data.expirationDate)}</p>` : ""}
    </div>
  </div>
  <div class="customer-section">
    <h3 style="margin-bottom: 10px; color: #000; text-transform: uppercase; font-size: 12px; border-bottom: 1px solid #dee2e6; padding-bottom: 5px;">Datos del Cliente</h3>
    <div class="customer-grid">
      <div>
        <p style="color: #666; font-size: 10px; text-transform: uppercase;">Razón Social</p>
        <p style="font-size: 14px; font-weight: bold;">${data.customer.businessName}</p>
      </div>
      ${
        data.customer.fantasyName
          ? `
      <div>
        <p style="color: #666; font-size: 10px; text-transform: uppercase;">Nombre Fantasía</p>
        <p style="font-size: 14px;">${data.customer.fantasyName}</p>
      </div>`
          : ""
      }
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>SKU</th>
        <th>Producto / Marca</th>
        <th style="text-align: right;">Cant.</th>
        <th style="text-align: center;">Unid.</th>
        ${hasWeight ? '<th style="text-align: right;">Peso/Vol</th>' : ""}
        <th style="text-align: right;">Precio U.</th>
        ${hasDiscounts ? '<th style="text-align: right;">Desc.</th>' : ""}
        <th style="text-align: right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>
  <div class="totals-container">
    <table class="totals-table">
      <tr>
        <td>Subtotal:</td>
        <td style="text-align: right;">${formatCurrency(data.subtotal)}</td>
      </tr>
      ${
        data.discountTotal > 0
          ? `
      <tr>
        <td>Desc. Global:</td>
        <td style="text-align: right; color: #d63031;">-${formatCurrency(data.discountTotal)}</td>
      </tr>`
          : ""
      }
      ${
        data.taxesTotal > 0
          ? `
      <tr>
        <td>Impuestos:</td>
        <td style="text-align: right;">${formatCurrency(data.taxesTotal)}</td>
      </tr>`
          : ""
      }
      <tr class="total-final">
        <td>TOTAL:</td>
        <td style="text-align: right;">${formatCurrency(data.total)}</td>
      </tr>
    </table>
  </div>
  ${
    data.observations
      ? `
  <div class="observations">
    <strong style="display: block; margin-bottom: 5px; text-transform: uppercase; font-size: 10px;">Observaciones</strong>
    <p style="white-space: pre-wrap;">${data.observations}</p>
  </div>`
      : ""
  }
</body>
</html>`;
}

/**
 * Generates remittance data from a sale order detail
 */
export function buildRemittanceFromSale(
  sale: SalesOrderDetail,
  type: "PRESUPUESTO" | "REMITO_FINAL"
): RemittanceData {
  const unitOfMeasureLabels: Record<string, string> = {
    UN: "unid",
    KG: "kg",
    LT: "lt",
    MT: "m",
  };

  const itemsSubtotal = sale.items.reduce(
    (sum, item) => sum + item.subtotal,
    0
  );
  const taxesTotal = sale.taxes.reduce(
    (sum, tax) => sum + (tax.taxAmount ?? 0),
    0
  );
  const discountTotal = sale.global_discount_amount ?? 0;

  return {
    type,
    documentNumber: sale.remittance_number ?? undefined,
    saleNumber: sale.sale_number,
    invoiceNumber: sale.invoice_number ?? undefined,
    date: sale.sale_date,
    expirationDate: sale.expiration_date ?? undefined,
    customer: {
      businessName: sale.customer.business_name,
      fantasyName: sale.customer.fantasy_name ?? undefined,
    },
    seller: {
      name: sale.seller?.name ?? sale.seller?.email ?? "Sin asignar",
      email: sale.seller?.email ?? undefined,
    },
    items: sale.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      brand: item.brand ?? undefined,
      quantity: item.quantity,
      unitOfMeasure:
        unitOfMeasureLabels[item.unitOfMeasure] ?? item.unitOfMeasure,
      weightQuantity:
        item.type === "adjustment"
          ? undefined
          : (item.weightQuantity ?? undefined),
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      discountPercentage:
        item.type === "adjustment"
          ? undefined
          : (item.discountPercent ?? undefined),
    })),
    subtotal: itemsSubtotal,
    taxesTotal,
    discountTotal,
    total: sale.total_amount,
    observations: sale.observations ?? undefined,
  };
}
