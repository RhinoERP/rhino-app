import { formatCurrency } from "@/lib/format";
import type { AdditionalQuoteTax } from "./client-quote-taxes";

export type ClientQuoteDocument = {
  organizationName: string;
  customerName: string;
  preparedOn: string;
  currency: "ARS" | "USD";
  paymentMethod: string;
  paymentTerm: string;
  observations: string;
  lines: {
    name: string;
    quantityLabel: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }[];
  taxes: { name: string; rate: number; taxAmount: number }[];
  additionalTaxes: AdditionalQuoteTax[];
  subtotal: number;
  taxAmount: number;
  total: number;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderClientQuoteHTML(quote: ClientQuoteDocument): string {
  const lineRows = quote.lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.name)}<small>${escapeHtml(line.quantityLabel)}</small></td>
        <td class="right">${line.quantity.toLocaleString("es-AR")}</td>
        <td class="right">${formatCurrency(line.unitPrice, quote.currency)}</td>
        <td class="right">${formatCurrency(line.subtotal, quote.currency)}</td>
      </tr>`
    )
    .join("");
  const taxRows = quote.taxes
    .map(
      (tax) =>
        `<div class="total-row"><span>${escapeHtml(tax.name)} (${tax.rate}%)</span><span>${formatCurrency(tax.taxAmount, quote.currency)}</span></div>`
    )
    .join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>
  body { font: 13px Arial, sans-serif; color: #182235; padding: 32px; }
  h1 { color: #09329d; font-size: 23px; margin: 0 0 12px; }
  h2 { font-size: 16px; margin: 28px 0 12px; }
  p { line-height: 1.5; margin: 6px 0; }
  .muted { color: #5d6879; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th, td { border-bottom: 1px solid #d9dfe8; padding: 10px 6px; text-align: left; vertical-align: top; }
  th { background: #eef3fa; }
  small { display: block; color: #5d6879; margin-top: 3px; }
  .right { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; max-width: 310px; }
  .total-row { display: flex; justify-content: space-between; gap: 20px; padding: 6px 0; }
  .grand-total { border-top: 2px solid #09329d; font-weight: bold; font-size: 16px; }
  .notice { margin-top: 28px; color: #5d6879; font-size: 11px; }
</style></head><body>
  <h1>Cotización para el cliente</h1>
  <p class="muted">${escapeHtml(quote.organizationName)} · ${escapeHtml(quote.preparedOn)}</p>
  <p><strong>Cliente:</strong> ${escapeHtml(quote.customerName)}</p>
  ${quote.paymentMethod ? `<p><strong>Forma de pago:</strong> ${escapeHtml(quote.paymentMethod)}</p>` : ""}
  ${quote.paymentTerm ? `<p><strong>Plazo:</strong> ${escapeHtml(quote.paymentTerm)}</p>` : ""}
  <h2>Productos</h2>
  <table><thead><tr><th>Producto</th><th class="right">Cantidad</th><th class="right">Precio unitario</th><th class="right">Subtotal</th></tr></thead><tbody>${lineRows}</tbody></table>
  <div class="totals">
    <div class="total-row"><span>Subtotal</span><span>${formatCurrency(quote.subtotal, quote.currency)}</span></div>
    ${taxRows}
    <div class="total-row grand-total"><span>Total estimado</span><span>${formatCurrency(quote.total, quote.currency)}</span></div>
  </div>
  ${quote.observations ? `<h2>Observaciones</h2><p>${escapeHtml(quote.observations)}</p>` : ""}
  <p class="notice">Cotización comercial sujeta a confirmación y aprobación interna. No es un comprobante fiscal.</p>
</body></html>`;
}
