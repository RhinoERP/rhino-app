import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDateOnly } from "@/lib/format";

export type PurchaseOrderPDFItem = {
  productName: string;
  unitOfMeasure: string | null;
  quantity: number;
  unitQuantity: number | null;
  unitCost: number;
  subtotal: number;
  variantStocks: Record<string, Record<string, number>> | null;
  itemTaxes: Array<{ name: string; rate: number; taxAmount: number }>;
};

export type PurchaseOrderPDFData = {
  purchaseNumber: string;
  purchaseDate: string;
  deliveryDate: string | null;
  expirationDate: string | null;
  remittanceNumber: string | null;
  logistics: string | null;
  currency: string;
  subtotal: number;
  globalDiscountAmount: number;
  globalDiscountPercentage: number | null;
  taxAmount: number;
  total: number;
  issuer: {
    organizationName: string;
    businessName: string;
    cuit: string | null;
    legalAddress: string | null;
    logoUrl: string | null;
  };
  supplier: {
    name: string;
    cuit: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    contactName: string | null;
    paymentTerms: string | null;
  };
  items: PurchaseOrderPDFItem[];
  taxes: Array<{ name: string; rate: number; taxAmount: number }>;
};

export type PurchaseOrderPDFSource = {
  purchase_number: number | null;
  purchase_date: string;
  delivery_date: string | null;
  expiration_date: string | null;
  remittance_number: string | null;
  logistics: string | null;
  currency: string;
  subtotal_amount: number | null;
  global_discount_amount: number | null;
  global_discount_percentage: number | null;
  tax_amount: number | null;
  total_amount: number;
  items: Array<{
    product_name?: string;
    unit_of_measure?: string | null;
    weight_per_unit?: number | null;
    quantity: number;
    unit_quantity: number | null;
    unit_cost: number;
    subtotal: number;
    variant_stocks?: Record<string, Record<string, number>> | null;
  }>;
  taxes: Array<{ name: string; rate: number; tax_amount: number }> | null;
};

export type PurchaseOrderPDFSupplierSource = {
  name: string;
  cuit?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_name?: string | null;
  payment_terms?: string | null;
};

export type BuildPurchaseOrderPDFDataInput = {
  purchaseOrder: PurchaseOrderPDFSource;
  supplier: PurchaseOrderPDFSupplierSource;
  organization: {
    id: string;
    name: string;
    cuit?: string | null;
    logo_url?: string | null;
  };
  branding?: {
    issuerBusinessName?: string | null;
    issuerLegalAddress?: string | null;
    issuerLogoUrl?: string | null;
  } | null;
  itemTaxesByLine?: Map<
    string,
    Array<{ name: string; rate: number; taxAmount: number }>
  >;
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

const formatCompactCurrency = (value: number): string =>
  formatCurrency(value).replace(/\s+/g, " ");

const formatQuantityValue = (value: number): string =>
  value % 1 === 0
    ? value.toLocaleString("es-AR", { maximumFractionDigits: 0 })
    : value.toLocaleString("es-AR", { maximumFractionDigits: 2 });

const WEIGHT_OR_VOLUME_UNITS = ["KG", "LT", "MT"];

const SINGLE_PAGE_ITEM_LIMIT = 9;
const FIRST_PAGE_ITEM_LIMIT = 13;
const CONTINUATION_PAGE_ITEM_LIMIT = 18;

function buildPurchaseOrderItems(
  purchaseOrder: PurchaseOrderPDFSource,
  itemTaxesByLine?: Map<
    string,
    Array<{ name: string; rate: number; taxAmount: number }>
  >
): PurchaseOrderPDFItem[] {
  return (purchaseOrder.items ?? []).map((item, index) => {
    const unitOfMeasure = item.unit_of_measure ?? null;
    const isWeightOrVolume =
      unitOfMeasure != null &&
      WEIGHT_OR_VOLUME_UNITS.includes(unitOfMeasure.toUpperCase());

    const unitQuantity =
      item.unit_quantity ??
      (isWeightOrVolume && item.weight_per_unit && item.quantity > 0
        ? item.quantity * item.weight_per_unit
        : null);

    const lineId = String(index);
    const itemTaxes = itemTaxesByLine?.get(lineId) ?? [];

    return {
      productName: item.product_name ?? "—",
      unitOfMeasure: unitOfMeasure ?? null,
      quantity: item.quantity ?? 0,
      unitQuantity,
      unitCost: item.unit_cost ?? 0,
      subtotal: item.subtotal ?? 0,
      variantStocks: item.variant_stocks ?? null,
      itemTaxes,
    };
  });
}

function buildIssuer(
  input: BuildPurchaseOrderPDFDataInput,
  businessName: string
): PurchaseOrderPDFData["issuer"] {
  const { organization, branding } = input;

  return {
    organizationName: organization.name || businessName,
    businessName,
    cuit: organization.cuit ?? null,
    legalAddress: branding?.issuerLegalAddress ?? null,
    logoUrl: organization.logo_url ?? branding?.issuerLogoUrl ?? null,
  };
}

function buildSupplier(
  supplier: PurchaseOrderPDFSupplierSource
): PurchaseOrderPDFData["supplier"] {
  return {
    name: supplier.name,
    cuit: supplier.cuit ?? null,
    address: supplier.address ?? null,
    phone: supplier.phone ?? null,
    email: supplier.email ?? null,
    contactName: supplier.contact_name ?? null,
    paymentTerms: supplier.payment_terms ?? null,
  };
}

export function buildPurchaseOrderPDFData(
  input: BuildPurchaseOrderPDFDataInput
): PurchaseOrderPDFData {
  const { purchaseOrder, supplier, organization, branding, itemTaxesByLine } =
    input;
  const businessName =
    branding?.issuerBusinessName?.trim() || organization.name || "Empresa";
  const purchaseNumber = purchaseOrder.purchase_number
    ? `Compra Nº ${purchaseOrder.purchase_number.toString().padStart(6, "0")}`
    : "Compra Nº —";

  return {
    purchaseNumber,
    purchaseDate: purchaseOrder.purchase_date,
    deliveryDate: purchaseOrder.delivery_date,
    expirationDate: purchaseOrder.expiration_date,
    remittanceNumber: purchaseOrder.remittance_number,
    logistics: purchaseOrder.logistics,
    currency: purchaseOrder.currency,
    subtotal: truncateMoney(purchaseOrder.subtotal_amount ?? 0),
    globalDiscountAmount: truncateMoney(
      purchaseOrder.global_discount_amount ?? 0
    ),
    globalDiscountPercentage: purchaseOrder.global_discount_percentage,
    taxAmount: truncateMoney(purchaseOrder.tax_amount ?? 0),
    total: truncateMoney(purchaseOrder.total_amount ?? 0),
    issuer: buildIssuer(input, businessName),
    supplier: buildSupplier(supplier),
    items: buildPurchaseOrderItems(purchaseOrder, itemTaxesByLine),
    taxes: (purchaseOrder.taxes ?? []).map((tax) => ({
      name: tax.name,
      rate: tax.rate,
      taxAmount: tax.tax_amount,
    })),
  };
}

type PurchaseOrderPDFPage = {
  items: PurchaseOrderPDFItem[];
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  isLastPage: boolean;
};

function paginateItems(items: PurchaseOrderPDFItem[]): PurchaseOrderPDFPage[] {
  if (items.length <= SINGLE_PAGE_ITEM_LIMIT) {
    return [
      {
        items,
        pageNumber: 1,
        totalPages: 1,
        isFirstPage: true,
        isLastPage: true,
      },
    ];
  }

  const pages: PurchaseOrderPDFItem[][] = [];
  let cursor = 0;

  pages.push(items.slice(cursor, cursor + FIRST_PAGE_ITEM_LIMIT));
  cursor += FIRST_PAGE_ITEM_LIMIT;

  while (cursor < items.length) {
    pages.push(items.slice(cursor, cursor + CONTINUATION_PAGE_ITEM_LIMIT));
    cursor += CONTINUATION_PAGE_ITEM_LIMIT;
  }

  return pages.map((pageItems, index) => ({
    items: pageItems,
    pageNumber: index + 1,
    totalPages: pages.length,
    isFirstPage: index === 0,
    isLastPage: index === pages.length - 1,
  }));
}

function buildHeaderHtml(data: PurchaseOrderPDFData): string {
  return `
    <div class="page-header">
      <div class="header-left">
        ${
          data.issuer.logoUrl
            ? `<img src="${escapeHtml(data.issuer.logoUrl)}" alt="Logo" class="issuer-logo" />`
            : `
        <div>
          <div class="company-name">${displayValue(data.issuer.businessName)}</div>
          <div class="company-detail">${displayValue(data.issuer.organizationName)}</div>
          <div class="company-detail">${displayValue(data.issuer.cuit, "Sin CUIT")}</div>
          ${
            data.issuer.legalAddress
              ? `<div class="company-detail">${escapeHtml(data.issuer.legalAddress)}</div>`
              : ""
          }
        </div>`
        }
      </div>
      <div class="header-right">
        <div class="doctype-label">Orden de compra</div>
        <div class="doctype-number">${escapeHtml(data.purchaseNumber)}</div>
        <div class="doctype-dates">Fecha: ${formatDateOnly(data.purchaseDate)}</div>
        ${
          data.deliveryDate
            ? `<div class="doctype-dates">Entrega: ${formatDateOnly(data.deliveryDate)}</div>`
            : ""
        }
        ${
          data.expirationDate
            ? `<div class="doctype-dates">Vencimiento: ${formatDateOnly(data.expirationDate)}</div>`
            : ""
        }
      </div>
    </div>
  `;
}

function buildSupplierHtml(data: PurchaseOrderPDFData): string {
  return `
    <div class="info-wrap">
      <div class="info-row">
        <div class="info-cell info-cell--wide"><span class="lbl">Proveedor:</span> <span class="val-bold">${displayValue(data.supplier.name)}</span></div>
        <div class="info-cell"><span class="lbl">CUIT:</span> ${displayValue(data.supplier.cuit)}</div>
      </div>
      <div class="info-row">
        <div class="info-cell info-cell--wide"><span class="lbl">Dirección:</span> ${displayValue(data.supplier.address)}</div>
        <div class="info-cell"><span class="lbl">Teléfono:</span> ${displayValue(data.supplier.phone)}</div>
      </div>
      ${
        data.supplier.contactName
          ? `<div class="info-row">
        <div class="info-cell info-cell--wide"><span class="lbl">Contacto:</span> ${displayValue(data.supplier.contactName)}</div>
        <div class="info-cell"><span class="lbl">Email:</span> ${displayValue(data.supplier.email)}</div>
      </div>`
          : ""
      }
      ${
        data.supplier.paymentTerms
          ? `<div class="info-row">
        <div class="info-cell"><span class="lbl">Condiciones de pago:</span> ${displayValue(data.supplier.paymentTerms)}</div>
      </div>`
          : ""
      }
    </div>
  `;
}

function buildContinuationHeader(
  data: PurchaseOrderPDFData,
  page: PurchaseOrderPDFPage
): string {
  return `
    <div class="page-header continuation-header">
      <div class="header-left">
        <div class="doctype-label">Orden de compra</div>
        <div class="doctype-number">${escapeHtml(data.purchaseNumber)}</div>
      </div>
      <div class="header-right">Página ${page.pageNumber}/${page.totalPages}</div>
    </div>
  `;
}

function renderVariantBreakdownText(
  variantStocks: Record<string, Record<string, number>>
): string {
  const parts: string[] = [];

  for (const [attribute, values] of Object.entries(variantStocks)) {
    const detailParts = Object.entries(values)
      .filter(([, qty]) => qty > 0)
      .map(([variantName, qty]) => `${variantName}: ${qty}`);

    if (detailParts.length > 0) {
      parts.push(
        `${escapeHtml(attribute)} ${detailParts.map(escapeHtml).join(", ")}`
      );
    }
  }

  return parts.length > 0
    ? `<div class="variant-detail">${parts.join(" — ")}</div>`
    : "";
}

function renderItemTaxes(
  itemTaxes: Array<{ name: string; rate: number; taxAmount: number }>
): string {
  if (itemTaxes.length === 0) {
    return "";
  }

  const parts = itemTaxes.map(
    (tax) =>
      `${escapeHtml(tax.name)}${tax.rate ? ` ${tax.rate.toFixed(2)}%` : ""}: ${formatCompactCurrency(tax.taxAmount)}`
  );

  return `<div class="item-tax-detail">${parts.join(" / ")}</div>`;
}

function buildItemsTableHtml(items: PurchaseOrderPDFItem[]): string {
  const rows = items
    .map((item) => {
      const quantity = item.unitQuantity ?? item.quantity;
      const unitLabel =
        item.unitOfMeasure && item.unitQuantity ? ` ${item.unitOfMeasure}` : "";
      const variantHtml = item.variantStocks
        ? renderVariantBreakdownText(item.variantStocks)
        : "";
      const itemTaxesHtml = renderItemTaxes(item.itemTaxes);

      return `
    <tr>
      <td class="c-desc">${displayValue(item.productName)}${variantHtml}${itemTaxesHtml}</td>
      <td class="c-qty">${formatQuantityValue(quantity)}${escapeHtml(unitLabel)}</td>
      <td class="c-right c-price">${formatCompactCurrency(item.unitCost)}</td>
      <td class="c-right c-bold c-amount">${formatCompactCurrency(item.subtotal)}</td>
    </tr>`;
    })
    .join("");

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Detalle</th>
            <th class="c-qty">Cantidad</th>
            <th class="c-price">Precio U.</th>
            <th class="c-amount">Importe</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function buildSummaryHtml(data: PurchaseOrderPDFData): string {
  const hasDiscount =
    data.globalDiscountAmount > 0 || (data.globalDiscountPercentage ?? 0) > 0;
  const currencySuffix =
    data.currency && data.currency !== "ARS"
      ? ` ${escapeHtml(data.currency)}`
      : "";

  return `
    <div class="breakdown">
      <div class="breakdown-column">
        <div class="breakdown-item">
          <span class="breakdown-label">Subtotal:</span>
          <span class="breakdown-value">${formatCompactCurrency(data.subtotal)}${currencySuffix}</span>
        </div>
        ${
          hasDiscount
            ? `<div class="breakdown-item">
          <span class="breakdown-label">Descuento${
            data.globalDiscountPercentage
              ? ` (${formatQuantityValue(data.globalDiscountPercentage)}%)`
              : ""
          }:</span>
          <span class="breakdown-value">-${formatCompactCurrency(data.globalDiscountAmount)}</span>
        </div>`
            : ""
        }
        ${data.taxes
          .map(
            (tax) => `
        <div class="breakdown-item">
          <span class="breakdown-label">${displayValue(tax.name)}${
            tax.rate ? ` (${formatQuantityValue(tax.rate)}%)` : ""
          }:</span>
          <span class="breakdown-value">${formatCompactCurrency(tax.taxAmount)}</span>
        </div>`
          )
          .join("")}
      </div>
      <div class="breakdown-column breakdown-total">
        <div class="total-label">Total:</div>
        <div class="total-amount">${formatCompactCurrency(data.total)}${currencySuffix}</div>
      </div>
    </div>
  `;
}

function buildFooterHtml(data: PurchaseOrderPDFData): string {
  const notes: string[] = [];

  if (data.remittanceNumber) {
    notes.push(`Remito: ${data.remittanceNumber}`);
  }

  if (data.logistics) {
    notes.push(`Logística: ${data.logistics}`);
  }

  if (notes.length === 0) {
    return "";
  }

  return `
    <div class="obs">
      ${notes.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}
    </div>
  `;
}

export function generatePurchaseOrderHTML(data: PurchaseOrderPDFData): string {
  const pages = paginateItems(data.items);

  const renderPage = (page: PurchaseOrderPDFPage) => `
    <div class="document-copy">
      ${page.isFirstPage ? buildHeaderHtml(data) : buildContinuationHeader(data, page)}
      <div class="divider"></div>
      ${page.isFirstPage ? buildSupplierHtml(data) : ""}
      ${buildItemsTableHtml(page.items)}
      ${page.isLastPage ? buildSummaryHtml(data) : ""}
      ${page.isLastPage ? buildFooterHtml(data) : ""}
      <div class="disclaimer">Documento no válido como factura</div>
    </div>
  `;

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
  .header-left { display:flex; align-items:center; gap:8px; flex:1; min-width:0; }
  .company-name { font-size:18px; font-weight:700; line-height:1.1; }
  .company-detail { font-size:8px; color:var(--muted); }
  .issuer-logo { max-width: 60px; max-height: 40px; object-fit: contain; flex-shrink: 0; }
  .header-right { text-align:right; flex-shrink:0; }
  .doctype-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--blue); margin-bottom:1px; }
  .doctype-number { font-size:14px; font-weight:700; line-height:1.1; margin-bottom:2px; }
  .doctype-dates { font-size:8px; color:var(--muted); }
  .continuation-header { border-bottom: 1px solid var(--border); }

  /* DIVIDER */
  .divider {
    height: 2px;
    background: var(--blue);
    margin-bottom: 10px;
    border-radius: 2px;
  }

  /* SUPPLIER INFO */
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
    word-break: break-word;
  }
  td:last-child { border-right: none; }
  .c-qty { width: 60px; text-align: center; }
  .c-desc { text-align: left; }
  .c-price { width: 75px; text-align: right; }
  .c-amount { width: 80px; text-align: right; }
  .c-right { text-align: right; }
  .c-center { text-align: center; }
  .c-bold { font-weight: 700; }
  .variant-detail {
    font-size: 7px;
    color: var(--muted);
    margin-top: 2px;
  }
  .item-tax-detail {
    font-size: 7px;
    color: var(--muted);
    margin-top: 2px;
  }

  /* TOTALS */
  .breakdown {
    margin-top: 10px;
    padding: 8px;
    background: var(--bg);
    border: 1px solid var(--bmd);
    border-radius: 4px;
    display: flex;
    justify-content: flex-end;
    gap: 24px;
    align-items: flex-start;
    font-size: 8.5px;
  }
  .breakdown-column {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .breakdown-total { text-align: right; }
  .breakdown-item {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .breakdown-label {
    color: var(--muted);
    font-weight: 600;
  }
  .breakdown-value {
    color: var(--dark);
    font-weight: 700;
    min-width: 80px;
    text-align: right;
  }
  .total-label {
    font-weight: 700;
    color: var(--blue);
    text-align: right;
  }
  .total-amount {
    font-size: 12px;
    font-weight: 700;
    color: var(--blue);
    min-width: 90px;
    text-align: right;
  }

  /* OBSERVATIONS */
  .obs {
    margin-top: 8px;
    font-size: 8.5px;
    padding: 6px 8px;
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

  @media print {
    body { background: var(--white); padding: 0; }
    .document-copy { box-shadow: none; min-height: auto; }
  }
</style>
</head>
<body>
${pages.map(renderPage).join("")}
</body>
</html>`;
}
