import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { QuoteItemExtraRow, QuoteItemRow, QuoteRow } from "../types";

export type QuotePDFData = {
  quote: QuoteRow;
  customer: {
    business_name: string;
    fantasy_name?: string | null;
    cuit?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  items: (QuoteItemRow & {
    product_name?: string;
    quote_item_extras?: QuoteItemExtraRow[];
  })[];
  organization: {
    name: string;
    cuit?: string | null;
  };
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
 * Generates quote HTML for PDF generation
 */
export function generateQuotePDFHTML(data: QuotePDFData): string {
  const customerName =
    data.customer.fantasy_name || data.customer.business_name || "Cliente";

  // Extras are priced per unit and duplicated across the item's variant rows;
  // they must be reflected both in the rendered lines and in the totals so the
  // PDF matches the quote's total_amount (which already includes them).
  const itemsWithExtras = data.items.map((item) => {
    const extrasTotal = truncateMoney(
      (item.quote_item_extras ?? []).reduce(
        (sum, extra) => sum + extra.price,
        0
      )
    );
    return {
      item,
      extrasTotal,
      displaySubtotal: truncateMoney(
        (item.subtotal ?? 0) + extrasTotal * item.quantity
      ),
    };
  });

  const subtotal = truncateMoney(
    itemsWithExtras.reduce((sum, entry) => sum + entry.displaySubtotal, 0)
  );

  const discountTotal = truncateMoney(
    data.items.reduce((sum, item) => sum + (item.discount_amount ?? 0), 0)
  );

  const total = truncateMoney(Math.max(0, subtotal - discountTotal));

  const itemsHTML = itemsWithExtras
    .map(({ item, extrasTotal, displaySubtotal }) => {
      const extrasHTML =
        extrasTotal > 0
          ? `<div class="item-extras">
        ${(item.quote_item_extras ?? [])
          .map(
            (extra) => `
          <div class="extra-line">
            <span>+ ${escapeHtml(extra.description)}</span>
            <span class="extra-price">${formatCurrency(extra.price)}</span>
          </div>`
          )
          .join("")}
      </div>`
          : "";
      return `
    <tr>
      <td class="c-qty">${item.quantity.toFixed(2).replace(TRAILING_ZERO_DECIMALS_REGEX, "")}</td>
      <td class="c-desc">${displayValue(item.description ?? item.product_name)}${extrasHTML}</td>
      <td class="c-right c-price">${formatCurrency(item.unit_price)}</td>
      ${item.discount_percentage ? `<td class="c-right c-discount">${item.discount_percentage.toFixed(1)}%</td>` : ""}
      <td class="c-right c-bold c-amount">${formatCurrency(displaySubtotal)}</td>
    </tr>`;
    })
    .join("");

  const hasDiscounts = data.items.some(
    (item) => item.discount_percentage != null && item.discount_percentage > 0
  );

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  :root {
    --blue:   #09329d;
    --dark:   #1a1f2e;
    --mid:    #4a5568;
    --muted:  #627499;
    --border: #e2e6f0;
    --bmd:    #c8cfe8;
    --bg:     #f7f8fc;
    --white:  #ffffff;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 8.5px;
    color: var(--dark);
    background: #dde2f0;
    line-height: 1.3;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 0;
    gap: 0;
  }
  .document-copy {
    width: 210mm;
    min-height: 297mm;
    padding: 7mm 10mm;
    background: var(--white);
    box-shadow: 0 2px 12px rgba(30,45,69,0.18);
  }

  /* HEADER */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 10px;
    gap: 16px;
    margin-bottom: 5px;
  }
  .header-left { display:flex; align-items:center; gap:8px; flex:1; }
  .company-name { font-size:18px; font-weight:700; line-height:1.1; }
  .header-right { text-align:right; flex-shrink:0; }
  .doctype-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--blue); margin-bottom:1px; }
  .doctype-number { font-size:16px; font-weight:700; line-height:1.1; margin-bottom:2px; }
  .doctype-dates { font-size:8px; color:var(--muted); }

  /* DIVIDER */
  .divider {
    height: 2px;
    background: var(--blue);
    margin-bottom: 10px;
    border-radius: 2px;
  }

  /* CUSTOMER INFO */
  .info-wrap {
    border: 1px solid var(--bmd);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .info-row {
    display: flex;
    border-bottom: 1px solid var(--border);
  }
  .info-row:last-child { border-bottom: none; }
  .info-cell {
    flex: 1;
    padding: 6px 8px;
    border-right: 1px solid var(--border);
    font-size: 8.5px;
    color: var(--dark);
    vertical-align: middle;
  }
  .info-cell--wide { flex: 2; }
  .info-cell:last-child { border-right: none; }
  .lbl { font-weight: 700; color: var(--muted); }
  .val-bold { font-weight: 700; color: var(--dark); }

  /* TABLE */
  .table-wrap {
    border: 1px solid var(--bmd);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  thead {
    background: var(--bg);
    border-bottom: 2px solid var(--bmd);
  }
  th {
    text-align: left;
    padding: 6px 8px;
    font-size: 8px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-right: 1px solid var(--border);
    vertical-align: middle;
  }
  th:last-child { border-right: none; }
  tbody tr {
    border-bottom: 1px solid var(--border);
  }
  tbody tr:last-child { border-bottom: none; }
  td {
    padding: 6px 8px;
    vertical-align: middle;
    border-right: 1px solid var(--border);
  }
  td:last-child { border-right: none; }
  .c-qty { width: 50px; text-align: center; }
  .c-desc { text-align: left; }
  .c-price { width: 70px; text-align: right; }
  .c-discount { width: 50px; text-align: right; }
  .c-amount { width: 70px; text-align: right; }
  .c-right { text-align: right; }
  .c-center { text-align: center; }
  .c-bold { font-weight: 700; }

  /* ITEM EXTRAS */
  .item-extras {
    margin-top: 2px;
    font-size: 7px;
    color: var(--muted);
    font-weight: 400;
  }
  .extra-line {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    line-height: 1.4;
  }
  .extra-price {
    white-space: nowrap;
  }

  /* TOTALS */
  .total-row {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
    padding: 10px 8px;
    background: var(--bg);
    border-top: 2px solid var(--bmd);
  }
  .total-label {
    font-weight: 700;
    color: var(--blue);
    min-width: 60px;
    text-align: right;
  }
  .total-amount {
    font-size: 11px;
    font-weight: 700;
    color: var(--blue);
    min-width: 90px;
    text-align: right;
  }

  /* BREAKDOWN */
  .breakdown {
    margin-top: 10px;
    padding: 8px;
    background: var(--bg);
    border: 1px solid var(--bmd);
    border-radius: 4px;
    display: flex;
    justify-content: flex-end;
    gap: 20px;
    font-size: 8.5px;
  }
  .breakdown-item {
    display: flex;
    gap: 8px;
  }
  .breakdown-label {
    color: var(--muted);
    font-weight: 600;
  }
  .breakdown-value {
    color: var(--dark);
    font-weight: 700;
    min-width: 70px;
    text-align: right;
  }

  /* OBSERVATIONS */
  .obs {
    margin-top: 8px;
    font-size: 8.5px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
  }
  .obs .lbl {
    margin-right: 4px;
  }

  /* DISCLAIMER */
  .disclaimer {
    margin-top: 10px;
    text-align: center;
    font-size: 7px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
  }

  /* SIGNATURE */
  .sig-wrap {
    margin-top: 20px;
    display: flex;
    justify-content: flex-end;
    padding-right: 20px;
  }
  .sig-block {
    width: 120px;
    text-align: center;
  }
  .sig-line {
    height: 1px;
    background: var(--dark);
    margin-bottom: 4px;
  }
  .sig-lbl {
    font-size: 8px;
    color: var(--muted);
    font-weight: 600;
  }

  @media print {
    body { background: var(--white); padding: 0; }
    .document-copy { box-shadow: none; min-height: auto; }
  }
</style>
</head>
<body>
<div class="document-copy">
  <div class="page-header">
    <div class="header-left">
      <div class="company-name">${escapeHtml(data.organization.name)}</div>
    </div>
    <div class="header-right">
      <div class="doctype-label">Presupuesto</div>
      <div class="doctype-number">N° ${escapeHtml(data.quote.id.substring(0, 8).toUpperCase())}</div>
      <div class="doctype-dates">Fecha: ${formatDateOnly(data.quote.created_at ?? new Date().toISOString())}</div>
    </div>
  </div>

  <div class="divider"></div>

  <div class="info-wrap">
    <div class="info-row">
      <div class="info-cell"><span class="lbl">Cliente:</span> <span class="val-bold">${displayValue(customerName)}</span></div>
      <div class="info-cell"><span class="lbl">CUIT / DNI:</span> ${displayValue(data.customer.cuit)}</div>
    </div>
    <div class="info-row">
      <div class="info-cell info-cell--wide"><span class="lbl">Dirección:</span> ${displayValue(data.customer.address)}</div>
      <div class="info-cell"><span class="lbl">Teléfono:</span> ${displayValue(data.customer.phone)}</div>
    </div>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:50px;text-align:center">Cant.</th>
          <th>Descripción</th>
          <th style="width:70px;text-align:right">Precio U.</th>
          ${hasDiscounts ? '<th style="width:50px;text-align:right">Desc.</th>' : ""}
          <th style="width:70px;text-align:right">Importe</th>
        </tr>
      </thead>
      <tbody>${itemsHTML}</tbody>
    </table>
  </div>

  <div class="breakdown">
    <div class="breakdown-item">
      <span class="breakdown-label">Subtotal:</span>
      <span class="breakdown-value">${formatCurrency(subtotal)}</span>
    </div>
    ${
      discountTotal > 0
        ? `
    <div class="breakdown-item">
      <span class="breakdown-label">Descuentos:</span>
      <span class="breakdown-value">-${formatCurrency(discountTotal)}</span>
    </div>
    `
        : ""
    }
    <div class="breakdown-item">
      <span class="breakdown-label">Total:</span>
      <span class="breakdown-value">${formatCurrency(total)}</span>
    </div>
  </div>

  ${data.quote.observations ? `<div class="obs"><span class="lbl">Observaciones:</span> ${displayValue(data.quote.observations, "")}</div>` : ""}

  <div class="disclaimer">Documento no válido como factura</div>

  <div class="sig-wrap">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-lbl">Firma</div>
    </div>
  </div>
</div>
</body>
</html>`;
}
