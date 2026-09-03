import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDateOnly } from "@/lib/format";

export type RouteSheetPdfRow = {
  date: string | null;
  document: string;
  customer: string;
  city: string | null;
  amount: number;
};

export type RouteSheetPdfData = {
  issuer: {
    businessName: string;
    cuit?: string | null;
    logoUrl?: string | null;
  };
  carrierName: string | null;
  scheduledDate: string;
  notes?: string | null;
  statusLabel: string;
  rows: RouteSheetPdfRow[];
  total: number;
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

export function generateRouteSheetHTML(data: RouteSheetPdfData): string {
  const logoHtml = data.issuer.logoUrl
    ? `<img src="${escapeHtml(data.issuer.logoUrl)}" alt="" class="logo" />`
    : "";

  const rowsHtml = data.rows
    .map((row) => {
      const date = row.date ? formatDateOnly(row.date) : "—";
      return `
        <tr>
          <td class="c-date">${escapeHtml(date)}</td>
          <td class="c-document">${escapeHtml(row.document)}</td>
          <td class="c-customer">${escapeHtml(row.customer)}</td>
          <td class="c-city">${escapeHtml(row.city ?? "—")}</td>
          <td class="c-amount">${escapeHtml(
            formatCurrency(truncateMoney(row.amount))
          )}</td>
        </tr>`;
    })
    .join("");

  const emptyRows = Array.from({ length: Math.max(0, 8 - data.rows.length) })
    .map(
      () => `
        <tr class="empty-row">
          <td></td><td></td><td></td><td></td><td></td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Hoja de Ruta</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      width: 210mm;
      min-height: 297mm;
      padding: 14mm 12mm;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 2px solid #222;
      padding-bottom: 10px;
      margin-bottom: 8px;
    }
    .logo { max-height: 48px; max-width: 140px; object-fit: contain; }
    .brand-name {
      font-size: 18px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .4px;
    }
    .brand-cuit { font-size: 11px; color: #444; margin-top: 2px; }
    .doc-label { text-align: right; }
    .doc-label .doctype { font-size: 15px; font-weight: 700; letter-spacing: .6px; }
    .doc-label .status { font-size: 10px; color: #555; margin-top: 3px; }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 10px 0;
    }
    .meta-box { border: 1px solid #ccc; border-radius: 3px; padding: 6px 8px; }
    .meta-label { font-size: 9px; text-transform: uppercase; color: #666; letter-spacing: .4px; }
    .meta-value { font-size: 12px; font-weight: 600; margin-top: 2px; }
    .table-wrap { border: 1px solid #222; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th {
      background: #f2f2f2;
      border-bottom: 1px solid #222;
      padding: 6px 8px;
      font-size: 9px;
      text-transform: uppercase;
      text-align: left;
      letter-spacing: .4px;
    }
    td { border-bottom: 1px solid #d8d8d8; padding: 7px 8px; font-size: 11px; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .empty-row td { border-bottom: 1px solid #eee; }
    .c-date { width: 15%; }
    .c-document { width: 16%; }
    .c-customer { width: 34%; }
    .c-city { width: 18%; }
    .c-amount { width: 17%; text-align: right; }
    tfoot td {
      border-top: 2px solid #222;
      background: #fafafa;
      font-weight: 700;
      font-size: 12px;
      text-align: right;
    }
    .footer {
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 10px;
      color: #444;
    }
    @page { size: A4; margin: 0; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoHtml}
      <div class="brand-name">${escapeHtml(
        data.issuer.businessName || "Hoja de Ruta"
      )}</div>
      ${data.issuer.cuit ? `<div class="brand-cuit">CUIT ${escapeHtml(data.issuer.cuit)}</div>` : ""}
    </div>
    <div class="doc-label">
      <div class="doctype">HOJA DE RUTA</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <div class="meta-label">Transporte</div>
      <div class="meta-value">${displayValue(data.carrierName)}</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Fecha programada</div>
      <div class="meta-value">${escapeHtml(formatDateOnly(data.scheduledDate))}</div>
    </div>
    ${
      data.notes
        ? `
    <div class="meta-box">
      <div class="meta-label">Observaciones</div>
      <div class="meta-value">${escapeHtml(data.notes)}</div>
    </div>`
        : ""
    }
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th class="c-date">Fecha</th>
          <th class="c-document">Comprobante</th>
          <th class="c-customer">Cliente</th>
          <th class="c-city">Localidad</th>
          <th class="c-amount">Importe</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        ${emptyRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="text-align:right;">Total</td>
          <td>${escapeHtml(formatCurrency(truncateMoney(data.total)))}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="footer">
    <span>${data.rows.length} venta${data.rows.length !== 1 ? "s" : ""}</span>
  </div>
</body>
</html>`;
}
