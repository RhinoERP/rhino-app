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
  singlePageDuplicate?: boolean;
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

const ONES = [
  "",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
];
const TENS = [
  "",
  "",
  "veinte",
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
];
const HUNDREDS = [
  "",
  "cien",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];

function formatMillions(n: number): string {
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const word =
    millions === 1 ? "un millón" : `${numberToWords(millions)} millones`;
  return rest > 0 ? `${word} ${numberToWords(rest)}` : word;
}

function formatThousands(n: number): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const word = thousands === 1 ? "mil" : `${numberToWords(thousands)} mil`;
  return rest > 0 ? `${word} ${numberToWords(rest)}` : word;
}

function formatHundreds(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const word = rest === 0 && h === 1 ? "cien" : HUNDREDS[h];
  return rest > 0 ? `${word} ${numberToWords(rest)}` : word;
}

function numberToWords(n: number): string {
  if (n === 0) {
    return "cero";
  }
  if (n < 0) {
    return `menos ${numberToWords(-n)}`;
  }

  const integer = Math.floor(n);

  if (integer >= 1_000_000) {
    return formatMillions(integer);
  }
  if (integer >= 1000) {
    return formatThousands(integer);
  }
  if (integer >= 100) {
    return formatHundreds(integer);
  }
  if (integer >= 20) {
    const t = Math.floor(integer / 10);
    const o = integer % 10;
    return o > 0 ? `${TENS[t]} y ${ONES[o]}` : TENS[t];
  }

  return ONES[integer];
}

function formatAmountInWords(amount: number): string {
  const integer = Math.floor(amount);
  const cents = Math.round((amount - integer) * 100);
  const intWords = numberToWords(integer).toUpperCase();
  return cents > 0
    ? `${intWords} con ${cents.toString().padStart(2, "0")}/100`
    : `${intWords} con 00/100`;
}

/**
 * Generates remittance HTML for PDF generation or printing
 */
const MAX_ITEMS_FOR_SINGLE_PAGE = 10;

export function generateRemittanceHTML(data: RemittanceData): string {
  const useSinglePage =
    data.singlePageDuplicate === true &&
    data.items.length <= MAX_ITEMS_FOR_SINGLE_PAGE;

  const hasWeight = data.items.some(
    (item) => item.weightQuantity != null && item.weightQuantity > 0
  );
  const hasDiscounts = data.items.some(
    (item) => item.discountPercentage != null && item.discountPercentage > 0
  );

  const documentTitle =
    data.type === "PRESUPUESTO" ? "PRESUPUESTO" : "REMITO DE VENTA";

  const displayDocumentNumber =
    data.type === "REMITO_FINAL"
      ? data.documentNumber || "—"
      : String(data.saleNumber ?? "—");

  const itemsHTML = data.items
    .map(
      (item) => `
    <tr>
      <td class="c-center">${item.quantity.toFixed(2).replace(TRAILING_ZERO_DECIMALS_REGEX, "")}</td>
      <td class="c-center">${displayValue(item.unitOfMeasure)}</td>
      ${hasWeight ? `<td class="c-right">${item.weightQuantity && item.weightQuantity > 0 ? item.weightQuantity.toFixed(2) : "—"}</td>` : ""}
      <td class="c-sku">${displayValue(item.sku)}</td>
      <td>${displayValue(item.name)}${item.brand ? ` <span class="brand">${displayValue(item.brand)}</span>` : ""}</td>
      <td class="c-right">${formatCurrency(item.unitPrice)}</td>
      ${hasDiscounts ? `<td class="c-right">${item.discountPercentage && item.discountPercentage > 0 ? `${item.discountPercentage.toFixed(1)}%` : "—"}</td>` : ""}
      <td class="c-right c-bold">${formatCurrency(item.subtotal)}</td>
    </tr>`
    )
    .join("");

  const buildDocumentContent = () => `
  <div class="page-header">
    <div class="header-left">
      ${data.issuer.logoUrl ? `<img src="${escapeHtml(data.issuer.logoUrl)}" alt="Logo" class="logo-img" />` : ""}
      <div class="company-name">${escapeHtml(data.issuer.businessName)}</div>
    </div>
    <div class="header-right">
      <div class="doctype-label">${documentTitle}</div>
      <div class="doctype-number">N° ${displayDocumentNumber}</div>
      <div class="doctype-dates">Fecha: ${formatDateOnly(data.date)}${data.expirationDate ? ` · Vencimiento: ${formatDateOnly(data.expirationDate)}` : ""}</div>
    </div>
  </div>

  <div class="divider"></div>

  <div class="info-wrap">
    <div class="info-row">
      <div class="info-cell"><span class="lbl">Razón Social:</span> <span class="val-bold">${displayValue(data.customer.businessName)}</span></div>
      <div class="info-cell"><span class="lbl">CUIT / DNI:</span> ${displayValue(data.customer.cuit)}</div>
      <div class="info-cell"><span class="lbl">Cond. de Venta:</span> ${displayValue(data.customer.taxCondition)}</div>
    </div>
    <div class="info-row">
      <div class="info-cell info-cell--wide"><span class="lbl">Dirección:</span> ${displayValue(data.customer.address)}</div>
      <div class="info-cell"><span class="lbl">Teléfono:</span> ${displayValue(data.customer.phone)}</div>
      <div class="info-cell"><span class="lbl">Vendedor:</span> ${displayValue(data.seller.name)}</div>
    </div>
    ${
      data.invoiceNumber
        ? `
    <div class="info-row">
      <div class="info-cell"><span class="lbl">Factura:</span> ${displayValue(data.invoiceNumber)}</div>
      <div class="info-cell"></div>
      <div class="info-cell"></div>
    </div>`
        : ""
    }
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:56px;text-align:center">Cant.</th>
          <th style="width:42px;text-align:center">Unid.</th>
          ${hasWeight ? '<th style="width:58px;text-align:right">Peso</th>' : ""}
          <th style="width:64px">SKU</th>
          <th>Descripción</th>
          <th style="width:100px;text-align:right">Precio U.</th>
          ${hasDiscounts ? '<th style="width:50px;text-align:right">Desc.</th>' : ""}
          <th style="width:108px;text-align:right">Importe</th>
        </tr>
      </thead>
      <tbody>${itemsHTML}</tbody>
    </table>
    <div class="total-row">
      <div class="total-words">Pesos: <em>${formatAmountInWords(data.total)}</em></div>
      <div class="total-label">TOTAL</div>
      <div class="total-amount">${formatCurrency(data.total)}</div>
    </div>
  </div>

  ${data.observations ? `<div class="obs"><span class="lbl">Observaciones:</span> ${displayValue(data.observations, "")}</div>` : ""}

  <div class="disclaimer">Documento no válido como factura</div>

  <div class="sig-wrap">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-lbl">Firma</div>
    </div>
  </div>`;

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
    padding: 0;
    gap: 0;
  }
  .document-copy {
    width: 210mm;
    ${useSinglePage ? "padding: 0;" : "min-height: 297mm; padding: 7mm 10mm;"}
    background: var(--white);
    ${useSinglePage ? "" : "box-shadow: 0 2px 12px rgba(30,45,69,0.18);"}
  }

  /* HALF PAGE (single-page duplicate mode) */
  .document-half {
    padding: 4mm 10mm;
  }
  .document-half .sig-wrap { margin-top: 14px; }

  /* CUT LINE */
  .cut-line {
    height: 15px;
    border-top: 1px dashed var(--bmd);
    background: var(--white);
    overflow: hidden;
  }

  /* HEADER */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 10px;
    gap: 16px;
  }
  .header-left { display:flex; align-items:center; gap:8px; }
  .logo-img { max-width:52px; max-height:46px; object-fit:contain; }
  .company-name { font-size:18px; font-weight:700; line-height:1.1; }
  .header-right { text-align:right; flex-shrink:0; }
  .doctype-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--blue); margin-bottom:1px; }
  .doctype-number { font-size:18px; font-weight:700; line-height:1.1; margin-bottom:2px; }
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
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th {
    background: var(--white);
    color: var(--dark);
    border-bottom: 1.5px solid var(--dark);
    padding: 5px 5px;
    font-size: 8.5px;
    font-weight: 700;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  td {
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
    padding: 6px 5px;
    vertical-align: middle;
    font-size: 8.5px;
  }
  td:last-child { border-right: none; }
  .c-center { text-align:center; }
  .c-right  { text-align:right; }
  .c-sku    { font-size:7.5px; color:var(--muted); }
  .c-bold   { font-weight:700; }
  .brand    { font-size:7.5px; color:var(--muted); margin-left:2px; }

  /* TOTAL */
  .total-row {
    display: flex;
    align-items: center;
    border-top: 1.5px solid var(--bmd);
    background: var(--white);
  }
  .total-words {
    flex: 1;
    padding: 6px 8px;
    font-size: 8.5px;
    color: var(--mid);
    border-right: 1px solid var(--bmd);
  }
  .total-words em { font-style:normal; font-weight:600; color:var(--dark); }
  .total-label {
    padding: 6px 10px;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--blue);
  }
  .total-amount {
    padding: 6px 10px;
    font-size: 15px;
    font-weight: 700;
    color: var(--dark);
    min-width: 116px;
    text-align: right;
  }

  /* OBS */
  .obs { margin-top:8px; padding:5px 8px; border:1px solid var(--border); border-radius:4px; background:var(--bg); font-size:7.5px; }

  /* DISCLAIMER */
  .disclaimer { margin-top:5px; text-align:left; font-size:7px; color:var(--muted); font-style:italic; }

  /* FIRMA */
  .sig-wrap { display:flex; justify-content:flex-end; margin-top:48px; }
  .sig-block { width:200px; }
  .sig-line { height:1px; background:var(--bmd); margin-bottom:4px; }
  .sig-lbl { font-size:8.5px; color:var(--muted); text-align:center; }

  /* PAGE BREAKS */
  .document-copy + .document-copy { page-break-before:always; }
  @page { size:A4; margin:0; }
  tr { page-break-inside:avoid; }
</style>
</head>
<body>
  ${
    useSinglePage
      ? `
  <div class="document-copy">
    <div class="document-half">${buildDocumentContent()}</div>
    <div class="cut-line"></div>
    <div class="document-half">${buildDocumentContent()}</div>
  </div>
  `
      : `
  <div class="document-copy">${buildDocumentContent()}</div>
  <div class="document-copy">${buildDocumentContent()}</div>
  `
  }
</body>
</html>`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: builds complex remittance structure from sale
export function buildRemittanceFromSale(
  sale: SalesOrderDetail,
  type: "PRESUPUESTO" | "REMITO_FINAL",
  issuer?: {
    businessName?: string | null;
    cuit?: string | null;
    singlePageDuplicate?: boolean;
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
  const customerAddress = [
    sale.customer.delivery_address ?? sale.customer.address,
    sale.customer.delivery_city ?? sale.customer.city,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    type,
    documentNumber: sale.remittance_number ?? undefined,
    saleNumber: sale.sale_number,
    invoiceNumber:
      sale.arca_status === "authorized"
        ? (sale.invoice_number ?? undefined)
        : undefined,
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
    singlePageDuplicate: issuer?.singlePageDuplicate ?? false,
  };
}
