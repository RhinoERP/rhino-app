import { remittanceIssuerConfig } from "@/config/remittance";
import { truncateMoney } from "@/lib/decimal";
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
  issuer: {
    businessName: string;
    cuit?: string | null;
    legalAddress?: string | null;
    logoUrl?: string | null;
  };
  customer: {
    businessName: string;
    fantasyName?: string | null;
    cuit?: string | null;
    phone?: string | null;
    address?: string | null;
    taxCondition?: string | null;
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

const escapeHtml = (value: string | null | undefined): string => {
  if (!value) {
    return "";
  }

  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const displayValue = (value: string | null | undefined, fallback = "—") => {
  const trimmed = value?.trim();
  return escapeHtml(trimmed || fallback);
};

const TRAILING_ZERO_DECIMALS_REGEX = /\.00$/;

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
          <td class="cell-sku">${displayValue(item.sku)}</td>
          <td>
            <div style="font-weight: 600;">${displayValue(item.name)}</div>
            ${item.brand ? `<div class="muted">${displayValue(item.brand)}</div>` : ""}
          </td>
          <td class="cell-right">${item.quantity
            .toFixed(2)
            .replace(TRAILING_ZERO_DECIMALS_REGEX, "")}</td>
          <td class="cell-center">${displayValue(item.unitOfMeasure)}</td>
          ${hasWeight ? `<td class="cell-right">${item.weightQuantity ? item.weightQuantity.toFixed(2) : "-"}</td>` : ""}
          <td class="cell-right">${formatCurrency(item.unitPrice)}</td>
          ${hasDiscounts ? `<td class="cell-right">${item.discountPercentage ? `${item.discountPercentage.toFixed(1)}%` : "0.0%"}</td>` : ""}
          <td class="cell-right strong">${formatCurrency(item.subtotal)}</td>
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
      padding: 12mm;
      color: #111827;
      background-color: #ffffff;
      line-height: 1.4;
      font-size: 12px;
    }
    .muted { color: #6b7280; font-size: 10px; }
    .strong { font-weight: 700; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
      gap: 14px;
      border-bottom: 2px solid #111827;
      padding-bottom: 12px;
    }
    .issuer {
      display: grid;
      grid-template-columns: 60px 1fr;
      gap: 10px;
      align-items: center;
      flex: 1 1 auto;
      min-width: 0;
    }
    .issuer--no-logo {
      grid-template-columns: 1fr;
    }
    .issuer-logo {
      width: 60px;
      height: 60px;
      object-fit: contain;
      border: 1px solid #e5e7eb;
      padding: 4px;
      border-radius: 6px;
    }
    .doc-info {
      flex: 0 0 320px;
      text-align: right;
    }
    .section-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .card {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 10px;
      background: #f9fafb;
      min-height: 120px;
    }
    .card h3 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #4b5563;
      margin-bottom: 8px;
    }
    .meta-row {
      display: grid;
      grid-template-columns: 92px 1fr;
      gap: 6px;
      margin-bottom: 4px;
    }
    .meta-label {
      color: #6b7280;
      font-size: 10px;
      text-transform: uppercase;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      table-layout: fixed;
    }
    th {
      background: #111827;
      color: #fff;
      border: 1px solid #111827;
      padding: 8px 6px;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    td {
      border: 1px solid #e5e7eb;
      padding: 8px 6px;
      vertical-align: middle;
    }
    .cell-sku { width: 90px; font-family: monospace; font-size: 11px; }
    .cell-right { text-align: right; }
    .cell-center { text-align: center; }
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
    }
    .totals {
      width: 320px;
      border-collapse: collapse;
    }
    .totals td {
      border: none;
      border-bottom: 1px solid #e5e7eb;
      padding: 6px 0;
    }
    .total-final td {
      border-top: 2px solid #111827;
      border-bottom: none;
      font-size: 15px;
      font-weight: 700;
      padding-top: 8px;
    }
    .observations {
      margin-top: 16px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 10px;
      background: #f9fafb;
      font-size: 11px;
    }
    @page { size: A4; margin: 0; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="header">
    <div class="issuer ${data.issuer.logoUrl ? "" : "issuer--no-logo"}">
      ${data.issuer.logoUrl ? `<img src="${escapeHtml(data.issuer.logoUrl)}" alt="Logo" class="issuer-logo" />` : ""}
      <div>
        <h1 style="font-size: 24px; line-height: 1.1; margin-bottom: 6px;">${escapeHtml(documentTitle)}</h1>
        <p><strong>${displayValue(data.issuer.businessName)}</strong></p>
        <p><strong>CUIT:</strong> ${displayValue(data.issuer.cuit)}</p>
        <p><strong>Dirección:</strong> ${displayValue(data.issuer.legalAddress)}</p>
      </div>
    </div>
    <div class="doc-info">
      <p style="font-size: 18px; margin-bottom: 4px;"><strong>${escapeHtml(documentLabel)}</strong> ${data.saleNumber || data.documentNumber || "—"}</p>
      <p><strong>Fecha:</strong> ${formatDateOnly(data.date)}</p>
      ${data.expirationDate ? `<p><strong>Vencimiento:</strong> ${formatDateOnly(data.expirationDate)}</p>` : ""}
      <p><strong>Vendedor:</strong> ${displayValue(data.seller.name)}</p>
      ${data.seller.email ? `<p class="muted">${displayValue(data.seller.email)}</p>` : ""}
    </div>
  </div>

  <div class="section-grid">
    <div class="card">
      <h3>Datos del Cliente</h3>
      <div class="meta-row">
        <div class="meta-label">Razón Social</div>
        <div class="strong">${displayValue(data.customer.businessName)}</div>
      </div>
      ${data.customer.fantasyName ? `<div class="meta-row"><div class="meta-label">Fantasía</div><div>${displayValue(data.customer.fantasyName)}</div></div>` : ""}
      <div class="meta-row">
        <div class="meta-label">CUIT / DNI</div>
        <div>${displayValue(data.customer.cuit)}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Cond. IVA</div>
        <div>${displayValue(data.customer.taxCondition)}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Teléfono</div>
        <div>${displayValue(data.customer.phone)}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Dirección</div>
        <div>${displayValue(data.customer.address)}</div>
      </div>
    </div>
    <div class="card">
      <h3>Comprobante</h3>
      <div class="meta-row">
        <div class="meta-label">Número</div>
        <div>${data.saleNumber || data.documentNumber || "—"}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Tipo</div>
        <div>${escapeHtml(documentTitle)}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Factura</div>
        <div>${displayValue(data.invoiceNumber)}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Ítems</div>
        <div>${data.items.length}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Moneda</div>
        <div>ARS</div>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 90px;">SKU</th>
        <th>Producto</th>
        <th style="width: 78px; text-align: right;">Cantidad</th>
        <th style="width: 62px; text-align: center;">Unid.</th>
        ${hasWeight ? '<th style="width: 80px; text-align: right;">Peso/Vol</th>' : ""}
        <th style="width: 112px; text-align: right;">Precio U.</th>
        ${hasDiscounts ? '<th style="width: 72px; text-align: right;">Desc.</th>' : ""}
        <th style="width: 118px; text-align: right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>

  <div class="totals-wrap">
    <table class="totals">
      <tr>
        <td>Subtotal ítems:</td>
        <td class="cell-right">${formatCurrency(data.subtotal)}</td>
      </tr>
      ${
        data.discountTotal > 0
          ? `
      <tr>
        <td>Descuento global:</td>
        <td class="cell-right" style="color: #b91c1c;">-${formatCurrency(data.discountTotal)}</td>
      </tr>`
          : ""
      }
      ${
        data.taxesTotal > 0
          ? `
      <tr>
        <td>Impuestos:</td>
        <td class="cell-right">${formatCurrency(data.taxesTotal)}</td>
      </tr>`
          : ""
      }
      <tr class="total-final">
        <td>TOTAL:</td>
        <td class="cell-right">${formatCurrency(data.total)}</td>
      </tr>
    </table>
  </div>

  ${
    data.observations
      ? `
  <div class="observations">
    <strong style="display: block; margin-bottom: 4px; text-transform: uppercase; font-size: 10px;">Observaciones</strong>
    <p style="white-space: pre-wrap;">${displayValue(data.observations, "")}</p>
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
  type: "PRESUPUESTO" | "REMITO_FINAL",
  issuer?: {
    businessName?: string | null;
    cuit?: string | null;
  }
): RemittanceData {
  const unitOfMeasureLabels: Record<string, string> = {
    UN: "unid",
    KG: "kg",
    LT: "lt",
    MT: "m",
  };

  const subtotal = truncateMoney(
    sale.items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0)
  );
  const taxesTotal = truncateMoney(
    sale.taxes.reduce((sum, tax) => sum + (tax.taxAmount ?? 0), 0)
  );
  const discountTotal = truncateMoney(sale.global_discount_amount ?? 0);

  const total = truncateMoney(
    Math.max(0, subtotal - discountTotal + taxesTotal)
  );
  const customerAddress = [sale.customer.address, sale.customer.city]
    .filter(Boolean)
    .join(", ");

  return {
    type,
    documentNumber: sale.remittance_number ?? undefined,
    saleNumber: sale.sale_number,
    invoiceNumber: sale.invoice_number ?? undefined,
    date: sale.sale_date,
    expirationDate: sale.expiration_date ?? undefined,
    issuer: {
      businessName: issuer?.businessName ?? "Empresa",
      cuit: issuer?.cuit ?? undefined,
      legalAddress: remittanceIssuerConfig.legalAddress,
      logoUrl: remittanceIssuerConfig.logoUrl,
    },
    customer: {
      businessName: sale.customer.business_name,
      fantasyName: sale.customer.fantasy_name ?? undefined,
      cuit: sale.customer.cuit ?? undefined,
      phone: sale.customer.phone ?? undefined,
      address: customerAddress || undefined,
      taxCondition: sale.customer.tax_condition ?? undefined,
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
    subtotal,
    taxesTotal,
    discountTotal,
    total,
    observations: sale.observations ?? undefined,
  };
}
