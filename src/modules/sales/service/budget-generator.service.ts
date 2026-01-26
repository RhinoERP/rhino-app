import { formatCurrency, formatDateOnly } from "@/lib/format";

type PreSaleRemittanceItem = {
  sku: string;
  name: string;
  brand?: string | null;
  quantity: number;
  unitOfMeasure: string;
  weightQuantity?: number | null;
  unitPrice: number;
  subtotal: number;
  discountPercentage?: number | null;
};

type PreSaleRemittanceData = {
  date: string;
  expirationDate?: string | null;
  customerName: string;
  sellerName: string;
  items: PreSaleRemittanceItem[];
  subtotal: number;
  taxesTotal: number;
  discountTotal: number;
  total: number;
  observations?: string | null;
};

/**
 * Generates a budget/quote HTML from pre-sale form data
 */
export function generatePreSaleBudgetHTML(data: PreSaleRemittanceData): string {
  const itemsHTML = data.items
    .map(
      (item) => `
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">${item.sku}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${item.name}${item.brand ? ` - ${item.brand}` : ""}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.quantity}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.unitOfMeasure}</td>
      ${item.weightQuantity ? `<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.weightQuantity.toFixed(2)}</td>` : ""}
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(item.unitPrice)}</td>
      ${item.discountPercentage ? `<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.discountPercentage.toFixed(1)}%</td>` : ""}
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(item.subtotal)}</td>
    </tr>
  `
    )
    .join("");

  const hasWeight = data.items.some((item) => item.weightQuantity);
  const hasDiscounts = data.items.some((item) => item.discountPercentage);

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Presupuesto - ${data.customerName}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      color: #333;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #333;
    }
    .company-info {
      flex: 1;
    }
    .document-info {
      text-align: right;
    }
    .customer-section {
      margin: 20px 0;
      padding: 10px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th {
      background-color: #333;
      color: white;
      padding: 10px;
      text-align: left;
      border: 1px solid #ddd;
    }
    .totals {
      margin-top: 20px;
      text-align: right;
    }
    .totals table {
      margin-left: auto;
      width: 300px;
    }
    .totals td {
      padding: 5px 10px;
    }
    .total-final {
      font-weight: bold;
      font-size: 1.2em;
      border-top: 2px solid #333;
    }
    .observations {
      margin-top: 20px;
      padding: 10px;
      background-color: #f9f9f9;
      border-left: 4px solid #333;
    }
    .notice {
      margin-top: 30px;
      padding: 15px;
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      text-align: center;
      font-style: italic;
    }
    @media print {
      body {
        margin: 0;
      }
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-info">
      <h1>Presupuesto Inicial</h1>
      <p><strong>Vendedor:</strong> ${data.sellerName}</p>
    </div>
    <div class="document-info">
      <p><strong>Fecha:</strong> ${formatDateOnly(data.date)}</p>
      ${data.expirationDate ? `<p><strong>Validez:</strong> ${formatDateOnly(data.expirationDate)}</p>` : ""}
    </div>
  </div>

  <div class="customer-section">
    <h3>Cliente</h3>
    <p><strong>Razón Social:</strong> ${data.customerName}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>SKU</th>
        <th>Producto</th>
        <th style="text-align: right;">Cantidad</th>
        <th style="text-align: center;">Unidad</th>
        ${hasWeight ? '<th style="text-align: right;">Peso/Vol</th>' : ""}
        <th style="text-align: right;">Precio Unit.</th>
        ${hasDiscounts ? '<th style="text-align: right;">Descuento</th>' : ""}
        <th style="text-align: right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <td>Subtotal:</td>
        <td style="text-align: right;">${formatCurrency(data.subtotal)}</td>
      </tr>
      ${
        data.discountTotal > 0
          ? `
      <tr>
        <td>Descuento:</td>
        <td style="text-align: right;">-${formatCurrency(data.discountTotal)}</td>
      </tr>
      `
          : ""
      }
      ${
        data.taxesTotal > 0
          ? `
      <tr>
        <td>Impuestos:</td>
        <td style="text-align: right;">${formatCurrency(data.taxesTotal)}</td>
      </tr>
      `
          : ""
      }
      <tr class="total-final">
        <td>TOTAL ESTIMADO:</td>
        <td style="text-align: right;">${formatCurrency(data.total)}</td>
      </tr>
    </table>
  </div>

  ${
    data.observations
      ? `
  <div class="observations">
    <h4>Observaciones</h4>
    <p>${data.observations}</p>
  </div>
  `
      : ""
  }

  <div class="notice">
    <p><strong>⚠️ DOCUMENTO NO VÁLIDO PARA FACTURACIÓN</strong></p>
    <p>Este es un presupuesto inicial. Los valores pueden variar al confirmar la venta.</p>
  </div>

  <div class="no-print" style="margin-top: 30px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor: pointer; background-color: #333; color: white; border: none; border-radius: 4px;">
      Imprimir / Guardar como PDF
    </button>
  </div>
</body>
</html>
  `;
}
