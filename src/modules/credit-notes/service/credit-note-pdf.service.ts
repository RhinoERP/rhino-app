import QRCode from "qrcode";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { buildArcaQrVerifierUrlFromInput } from "@/modules/arca/arca-qr";
import { getCustomerTaxConditionLabel } from "@/modules/customers/tax-conditions";
import {
  getInvoiceTypeLabel,
  getInvoiceTypeLetter,
} from "@/modules/sales/invoice-type-utils";
import type { InvoiceType } from "@/modules/sales/types";
import type { CreditNote } from "../types";

const SINGLE_PAGE_ITEM_LIMIT = 11;
const FIRST_PAGE_ITEM_LIMIT = 17;
const CONTINUATION_PAGE_ITEM_LIMIT = 24;

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

const displayValue = (value: string | null | undefined, fallback = "-") => {
  const trimmed = value?.trim();
  return escapeHtml(trimmed || fallback);
};

function formatArcaNumber(
  pointOfSale: number | null,
  voucherNumber: number | null
): string | null {
  if (!(pointOfSale && voucherNumber)) {
    return null;
  }

  return `${String(pointOfSale).padStart(4, "0")}-${String(voucherNumber).padStart(8, "0")}`;
}

function formatVoucherTypeCode(value: number | null | undefined): string {
  return value ? String(value).padStart(3, "0") : "-";
}

function formatQuantityValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatPercentValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "0";
  }

  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return formatCurrency(value).replace(/\s+/g, " ");
}

function formatTaxAmountLabel(name: string, rate: number): string {
  const formattedRate = formatPercentValue(rate);
  return `${name} ${formattedRate}%`;
}

function getNumericIdentifier(value: string | null | undefined): number | null {
  const numeric = value?.replace(/\D/g, "") ?? "";
  if (!numeric) {
    return null;
  }

  const parsed = Number(numeric);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function calculateDiscountPercent(params: {
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  discountPercent?: number | null;
}): number {
  if (
    params.discountPercent !== null &&
    params.discountPercent !== undefined &&
    Number.isFinite(params.discountPercent)
  ) {
    return params.discountPercent;
  }

  const grossAmount = params.quantity * params.unitPrice;
  if (!(grossAmount > 0 && params.discountAmount > 0)) {
    return 0;
  }

  return (params.discountAmount / grossAmount) * 100;
}

export type ReturnItem = {
  productName: string;
  quantity: number;
  unitPrice: number;
  creditAmount: number;
  productSku?: string | null;
  unitOfMeasure?: string | null;
  weightQuantity?: number | null;
  discountAmount?: number | null;
  discountPercent?: number | null;
  netAmount?: number | null;
  taxAmount?: number | null;
};

export type CreditNotePDFBranding = {
  issuerBusinessName?: string | null;
  issuerLegalAddress?: string | null;
  issuerLogoUrl?: string | null;
};

export type CreditNotePDFItem = {
  code: string | null;
  detail: string;
  quantity: number;
  unitOfMeasure: string | null;
  weightQuantity: number | null;
  unitPrice: number;
  discountAmount: number;
  discountPercent: number;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export type CreditNotePDFTax = {
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
};

export type CreditNotePDFSourceDocument = {
  invoiceNumber: string | null;
  arcaPointOfSale: number | null;
  arcaVoucherNumber: number | null;
  arcaVoucherTypeCode: number | null;
  arcaVoucherDate: string | null;
  appliedAmount: number;
};

export type CreditNotePDFData = {
  creditNoteNumber: string;
  issueDate: string;
  invoiceType: string;
  originType: CreditNote["originType"];
  reason?: string | null;
  issuer: {
    organizationName: string;
    businessName: string;
    cuit?: string | null;
    legalAddress?: string | null;
    logoUrl?: string | null;
  };
  customer: {
    businessName: string;
    fantasyName?: string | null;
    cuit?: string | null;
    taxCondition?: string | null;
    address?: string | null;
    city?: string | null;
    clientNumber?: string | null;
    dueDays?: number | null;
  };
  sale: {
    saleNumber?: number | null;
    invoiceNumber?: string | null;
  } | null;
  amount: number;
  observations?: string | null;
  paymentCondition?: string | null;
  dueDate?: string | null;
  externalReference?: string | null;
  items: CreditNotePDFItem[];
  taxes: CreditNotePDFTax[];
  sourceDocuments: CreditNotePDFSourceDocument[];
  fiscal: {
    isAuthorized: boolean;
    number: string | null;
    cae: string | null;
    caeExpiresAt: string | null;
    pointOfSale: number | null;
    voucherNumber: number | null;
    voucherTypeCode: number | null;
  };
};

export type BuildCreditNotePDFDataInput = {
  creditNote: CreditNote;
  issuerName: string;
  issuerCuit?: string | null;
  returnItems?: ReturnItem[] | null;
  branding?: CreditNotePDFBranding | null;
};

type CreditNotePDFPage = {
  items: CreditNotePDFItem[];
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  isLastPage: boolean;
};

function resolveItemDetail(item: CreditNote["items"][number]): string {
  return (
    item.description?.trim() || item.productName?.trim() || "Producto devuelto"
  );
}

function buildCreditNoteItems(
  creditNote: CreditNote,
  returnItems?: ReturnItem[] | null
): CreditNotePDFItem[] {
  if (creditNote.items.length > 0) {
    return creditNote.items.map((item) => ({
      code: item.productSku,
      detail: resolveItemDetail(item),
      quantity: item.quantity,
      unitOfMeasure: item.productUnitOfMeasure,
      weightQuantity: item.weightQuantity,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      discountPercent: calculateDiscountPercent({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        discountPercent: item.discountPercent,
      }),
      netAmount: item.netAmount,
      taxAmount: item.taxAmount,
      totalAmount: item.totalAmount,
    }));
  }

  if (returnItems?.length) {
    return returnItems.map((item) => {
      const discountAmount = Number(item.discountAmount ?? 0);
      const netAmount = Number(
        item.netAmount ?? item.creditAmount - Number(item.taxAmount ?? 0)
      );

      return {
        code: item.productSku ?? null,
        detail: item.productName,
        quantity: item.quantity,
        unitOfMeasure: item.unitOfMeasure ?? null,
        weightQuantity: item.weightQuantity ?? null,
        unitPrice: item.unitPrice,
        discountAmount,
        discountPercent: calculateDiscountPercent({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount,
          discountPercent: item.discountPercent,
        }),
        netAmount,
        taxAmount: Number(item.taxAmount ?? item.creditAmount - netAmount),
        totalAmount: item.creditAmount,
      };
    });
  }

  return [
    {
      code: null,
      detail: creditNote.reason ?? creditNote.observations ?? "Nota de credito",
      quantity: 1,
      unitOfMeasure: null,
      weightQuantity: null,
      unitPrice: creditNote.amount,
      discountAmount: 0,
      discountPercent: 0,
      netAmount: creditNote.amount,
      taxAmount: 0,
      totalAmount: creditNote.amount,
    },
  ];
}

function buildSourceDocuments(
  creditNote: CreditNote
): CreditNotePDFSourceDocument[] {
  if (creditNote.sourceDocuments.length > 0) {
    return creditNote.sourceDocuments.map((source) => ({
      invoiceNumber: source.invoiceNumber,
      arcaPointOfSale: source.arcaPointOfSale,
      arcaVoucherNumber: source.arcaVoucherNumber,
      arcaVoucherTypeCode: source.arcaVoucherTypeCode,
      arcaVoucherDate: source.arcaVoucherDate,
      appliedAmount: source.appliedAmount,
    }));
  }

  if (creditNote.sale) {
    return [
      {
        invoiceNumber: creditNote.sale.invoiceNumber,
        arcaPointOfSale: creditNote.sale.arcaPointOfSale,
        arcaVoucherNumber: creditNote.sale.arcaVoucherNumber,
        arcaVoucherTypeCode: creditNote.sale.arcaVoucherTypeCode,
        arcaVoucherDate: creditNote.sale.arcaAuthorizedAt,
        appliedAmount: creditNote.amount,
      },
    ];
  }

  return [];
}

export function buildCreditNotePDFData(
  input: BuildCreditNotePDFDataInput
): CreditNotePDFData {
  const { creditNote, issuerName, issuerCuit, returnItems, branding } = input;
  const businessName =
    branding?.issuerBusinessName?.trim() || issuerName || "Empresa";

  return {
    creditNoteNumber: creditNote.creditNoteNumber ?? "-",
    issueDate: creditNote.issueDate,
    invoiceType: creditNote.invoiceType,
    originType: creditNote.originType,
    reason: creditNote.reason,
    issuer: {
      organizationName: issuerName || businessName,
      businessName,
      cuit: issuerCuit,
      legalAddress: branding?.issuerLegalAddress ?? null,
      logoUrl: branding?.issuerLogoUrl ?? null,
    },
    customer: {
      businessName: creditNote.customer?.businessName ?? "-",
      fantasyName: creditNote.customer?.fantasyName,
      cuit: creditNote.customer?.cuit ?? null,
      taxCondition:
        getCustomerTaxConditionLabel(creditNote.customer?.taxCondition) ??
        creditNote.customer?.taxCondition ??
        null,
      address: creditNote.customer?.address ?? null,
      city: creditNote.customer?.city ?? null,
      clientNumber: creditNote.customer?.clientNumber ?? null,
      dueDays: creditNote.customer?.dueDays ?? null,
    },
    sale: creditNote.sale,
    amount: creditNote.amount,
    observations: creditNote.observations,
    paymentCondition: null,
    dueDate: null,
    externalReference: null,
    items: buildCreditNoteItems(creditNote, returnItems),
    taxes: creditNote.taxes.map((tax) => ({
      name: tax.name,
      rate: tax.rate,
      baseAmount: tax.baseAmount,
      taxAmount: tax.taxAmount,
    })),
    sourceDocuments: buildSourceDocuments(creditNote),
    fiscal: {
      isAuthorized: creditNote.arcaStatus === "authorized",
      number: formatArcaNumber(
        creditNote.arcaPointOfSale,
        creditNote.arcaVoucherNumber
      ),
      cae: creditNote.arcaCae,
      caeExpiresAt: creditNote.arcaCaeExpiresAt,
      pointOfSale: creditNote.arcaPointOfSale,
      voucherNumber: creditNote.arcaVoucherNumber,
      voucherTypeCode: creditNote.arcaVoucherTypeCode,
    },
  };
}

function paginateItems(items: CreditNotePDFItem[]): CreditNotePDFPage[] {
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

  const pages: CreditNotePDFItem[][] = [];
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

function getReferenceDocument(data: CreditNotePDFData): string {
  const sourceReference = data.sourceDocuments
    .map((source) => {
      const arcaNumber = formatArcaNumber(
        source.arcaPointOfSale,
        source.arcaVoucherNumber
      );

      return source.invoiceNumber || arcaNumber;
    })
    .filter((value): value is string => Boolean(value));

  if (sourceReference.length > 0) {
    return sourceReference.join(" / ");
  }

  if (data.sale?.invoiceNumber) {
    return data.sale.invoiceNumber;
  }

  if (data.sale?.saleNumber != null) {
    return `N ${data.sale.saleNumber}`;
  }

  return "-";
}

function getPaymentConditionLabel(data: CreditNotePDFData): string {
  if (data.paymentCondition) {
    return data.paymentCondition;
  }
  if (data.customer.dueDays && data.customer.dueDays > 0) {
    return `Cuenta corriente ${data.customer.dueDays} dias`;
  }

  return "Cuenta corriente";
}

function getReasonLabel(data: CreditNotePDFData): string {
  if (data.reason?.trim()) {
    return data.reason.trim();
  }

  if (data.originType === "RETURN") {
    return "DEVOLUCION";
  }

  if (data.originType === "PURCHASE_TARGET") {
    return "BONIFICACION POR OBJETIVO";
  }

  return "AJUSTE";
}

function getInvoiceTypeDisplay(data: CreditNotePDFData): string {
  if (data.invoiceType === "NOTA_DE_VENTA") {
    return "NOTA DE CREDITO";
  }

  return "NOTA DE CREDITO";
}

function getInvoiceTypeSubtitle(data: CreditNotePDFData): string {
  if (data.invoiceType === "NOTA_DE_VENTA") {
    return "Comprobante interno";
  }

  return getInvoiceTypeLabel(data.invoiceType as InvoiceType);
}

function buildCustomerAddress(data: CreditNotePDFData): string {
  return [data.customer.address, data.customer.city]
    .filter(Boolean)
    .join(" - ");
}

async function generateCreditNoteQrDataUrl(
  data: CreditNotePDFData
): Promise<string | null> {
  if (
    !(
      data.fiscal.isAuthorized &&
      data.fiscal.pointOfSale &&
      data.fiscal.voucherNumber &&
      data.fiscal.voucherTypeCode &&
      data.fiscal.cae &&
      data.issuer.cuit
    )
  ) {
    return null;
  }

  try {
    const verifierUrl = buildArcaQrVerifierUrlFromInput({
      issueDate: data.issueDate,
      issuerCuit: data.issuer.cuit,
      pointOfSale: data.fiscal.pointOfSale,
      voucherTypeCode: data.fiscal.voucherTypeCode,
      voucherNumber: data.fiscal.voucherNumber,
      totalAmount: data.amount,
      currency: "PES",
      currencyRate: 1,
      receiverDocumentNumber: getNumericIdentifier(data.customer.cuit),
      receiverDocumentType: data.customer.cuit ? 80 : null,
      authorizationCode: data.fiscal.cae,
    });

    return await QRCode.toDataURL(verifierUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 170,
    });
  } catch {
    return null;
  }
}

function buildItemsRows(items: CreditNotePDFItem[]): string {
  return items
    .map(
      (item) => `
        <tr>
          <td class="cell-code">${displayValue(item.code)}</td>
          <td class="cell-right">${formatQuantityValue(item.quantity)}</td>
          <td class="cell-detail">${displayValue(item.detail)}</td>
          <td class="cell-center">${displayValue(item.unitOfMeasure)}</td>
          <td class="cell-right">${formatQuantityValue(item.weightQuantity)}</td>
          <td class="cell-right">${formatCompactCurrency(item.unitPrice)}</td>
          <td class="cell-right">${formatPercentValue(item.discountPercent)}</td>
          <td class="cell-right cell-amount">${formatCompactCurrency(item.totalAmount)}</td>
        </tr>
      `
    )
    .join("");
}

function resolveDisplayTaxes(data: CreditNotePDFData): CreditNotePDFTax[] {
  if (data.taxes.length > 0) {
    return data.taxes;
  }

  const itemTaxTotal = data.items.reduce(
    (sum, item) => sum + item.taxAmount,
    0
  );

  if (itemTaxTotal.toFixed(2) === "0.00") {
    return [];
  }

  return [
    {
      name: "IVA",
      rate: 0,
      baseAmount: data.items.reduce((sum, item) => sum + item.netAmount, 0),
      taxAmount: itemTaxTotal,
    },
  ];
}

function buildTaxesRows(data: CreditNotePDFData): string {
  const taxes = resolveDisplayTaxes(data);

  if (taxes.length === 0) {
    return `
      <tr>
        <td>IVA</td>
        <td class="cell-right">${formatCompactCurrency(0)}</td>
      </tr>
    `;
  }

  return taxes
    .map(
      (tax) => `
        <tr>
          <td>${escapeHtml(formatTaxAmountLabel(tax.name, tax.rate))}</td>
          <td class="cell-right">${formatCompactCurrency(tax.taxAmount)}</td>
        </tr>
      `
    )
    .join("");
}

function getItemPricingQuantity(item: CreditNotePDFItem): number {
  return item.weightQuantity && item.weightQuantity > 0
    ? item.weightQuantity
    : item.quantity;
}

function buildSourceDocumentsRows(data: CreditNotePDFData): string {
  if (data.sourceDocuments.length === 0) {
    return `
      <tr>
        <td>${displayValue(getReferenceDocument(data))}</td>
        <td class="cell-center">-</td>
        <td class="cell-right">-</td>
      </tr>
    `;
  }

  return data.sourceDocuments
    .map((source) => {
      const documentNumber =
        source.invoiceNumber ||
        formatArcaNumber(source.arcaPointOfSale, source.arcaVoucherNumber) ||
        "-";

      return `
        <tr>
          <td>${displayValue(documentNumber)}</td>
          <td class="cell-center">${displayValue(source.arcaVoucherDate ? formatDateOnly(source.arcaVoucherDate) : null)}</td>
          <td class="cell-right">${formatCompactCurrency(source.appliedAmount)}</td>
        </tr>
      `;
    })
    .join("");
}

function buildSummaryHtml(data: CreditNotePDFData): string {
  const grossSubtotal = data.items.reduce(
    (sum, item) => sum + getItemPricingQuantity(item) * item.unitPrice,
    0
  );
  const discountTotal = data.items.reduce(
    (sum, item) => sum + item.discountAmount,
    0
  );
  const netTotal = data.items.reduce((sum, item) => sum + item.netAmount, 0);

  return `
    <section class="closing-block">
      <div class="reason-row">
        <div class="reason-label">${displayValue(getReasonLabel(data))}</div>
        <div class="amount-text">Son pesos ${formatCompactCurrency(data.amount)}</div>
      </div>

      <div class="summary-grid">
        <div class="summary-table-wrap">
          <table class="compact-summary">
            <tbody>
              <tr>
                <td>Sub. Total</td>
                <td class="cell-right">${formatCompactCurrency(grossSubtotal)}</td>
              </tr>
              <tr>
                <td>Desc.</td>
                <td class="cell-right">${formatCompactCurrency(discountTotal)}</td>
              </tr>
              <tr>
                <td>Sub. Total 2</td>
                <td class="cell-right">${formatCompactCurrency(netTotal)}</td>
              </tr>
              ${buildTaxesRows(data)}
            </tbody>
          </table>
        </div>

        <div class="total-box">
          <span>Total</span>
          <strong>${formatCompactCurrency(data.amount)}</strong>
        </div>
      </div>
    </section>
  `;
}

function buildFiscalFooterHtml(
  data: CreditNotePDFData,
  qrDataUrl: string | null
) {
  const caeExpiration = data.fiscal.caeExpiresAt
    ? formatDateOnly(data.fiscal.caeExpiresAt)
    : "-";

  return `
    <footer class="fiscal-footer">
      <div class="footer-left">
        ${
          qrDataUrl
            ? `<img src="${qrDataUrl}" alt="QR fiscal ARCA" class="footer-qr" />`
            : `<div class="footer-qr-placeholder">Sin QR fiscal</div>`
        }
        <div>
          <div class="footer-status">${
            data.fiscal.isAuthorized
              ? "Comprobante autorizado por ARCA"
              : "Documento no autorizado en ARCA"
          }</div>
          <div>Tipo Comp. ${escapeHtml(formatVoucherTypeCode(data.fiscal.voucherTypeCode))}</div>
        </div>
      </div>
      <div class="footer-right">
        <div>CAE: <strong>${displayValue(data.fiscal.cae)}</strong></div>
        <div>Fecha Venc. CAE: <strong>${escapeHtml(caeExpiration)}</strong></div>
      </div>
    </footer>
  `;
}

function buildHeaderHtml(data: CreditNotePDFData): string {
  const displayNumber =
    data.fiscal.isAuthorized && data.fiscal.number
      ? data.fiscal.number
      : data.creditNoteNumber;
  const letter =
    data.invoiceType === "NOTA_DE_VENTA"
      ? "X"
      : getInvoiceTypeLetter(data.invoiceType as InvoiceType);

  return `
    <header class="invoice-header">
      <section class="issuer-panel">
        <div class="issuer-main">
          ${
            data.issuer.logoUrl
              ? `<img src="${escapeHtml(data.issuer.logoUrl)}" alt="Logo del emisor" class="issuer-logo" />`
              : ""
          }
          <div>
            <h1>${displayValue(data.issuer.businessName)}</h1>
            <p>${displayValue(data.issuer.legalAddress, "Domicilio no informado")}</p>
            <p>CUIT: ${displayValue(data.issuer.cuit)}</p>
          </div>
        </div>
        <div class="issuer-tax">IVA Responsable Inscripto</div>
      </section>

      <section class="letter-panel">
        <div class="letter-box">
          <div class="letter-value">${escapeHtml(letter)}</div>
          <div class="letter-code">Cod. ${escapeHtml(formatVoucherTypeCode(data.fiscal.voucherTypeCode))}</div>
        </div>
      </section>

      <section class="voucher-panel">
        <div class="voucher-number">Numero ${displayValue(displayNumber)}</div>
        <h2>${displayValue(getInvoiceTypeDisplay(data))}</h2>
        <div class="voucher-subtitle">${displayValue(getInvoiceTypeSubtitle(data))}</div>
        <div class="voucher-row"><span>Fecha</span><strong>${formatDateOnly(data.issueDate)}</strong></div>
        <div class="voucher-row"><span>CUIT</span><strong>${displayValue(data.issuer.cuit)}</strong></div>
      </section>
    </header>
  `;
}

function buildCustomerHtml(
  data: CreditNotePDFData,
  qrDataUrl: string | null
): string {
  const customerAddress = buildCustomerAddress(data);
  let expirationDate = "-";
  if (data.dueDate) {
    expirationDate = formatDateOnly(data.dueDate);
  } else if (data.fiscal.caeExpiresAt) {
    expirationDate = formatDateOnly(data.fiscal.caeExpiresAt);
  }

  return `
    <section class="customer-block">
      <div class="customer-grid">
        <div class="customer-cell customer-main">
          <div><span>Cliente</span><strong>${displayValue(data.customer.businessName)}</strong></div>
          ${
            data.customer.fantasyName
              ? `<div><span>Nombre fantasia</span><strong>${displayValue(data.customer.fantasyName)}</strong></div>`
              : ""
          }
          <div><span>Domicilio</span><strong>${displayValue(customerAddress, "No informado")}</strong></div>
          <div><span>Cond. Iva</span><strong>${displayValue(data.customer.taxCondition, "No informada")}</strong></div>
          <div><span>Cond. Vta.</span><strong>${escapeHtml(getPaymentConditionLabel(data))}</strong></div>
        </div>
        <div class="customer-cell">
          <div><span>Cuenta Nro</span><strong>${displayValue(data.customer.clientNumber)}</strong></div>
          <div><span>CUIT</span><strong>${displayValue(data.customer.cuit)}</strong></div>
          <div><span>Comp. asociado</span><strong>${displayValue(getReferenceDocument(data))}</strong></div>
          <div><span>Fecha Vto.</span><strong>${expirationDate}</strong></div>
          ${data.externalReference ? `<div><span>Referencia</span><strong>${escapeHtml(data.externalReference)}</strong></div>` : ""}
        </div>
        <div class="customer-qr-cell">
          ${
            qrDataUrl
              ? `<img src="${qrDataUrl}" alt="QR fiscal ARCA" class="customer-qr" />`
              : `<div class="customer-qr-empty">QR fiscal pendiente</div>`
          }
        </div>
      </div>
    </section>
  `;
}

function buildItemsTableHtml(page: CreditNotePDFPage): string {
  const title = page.isFirstPage
    ? "Detalle de productos"
    : `Detalle de productos - continuacion ${page.pageNumber}`;

  return `
    <section class="items-block">
      <div class="block-title">${escapeHtml(title)}</div>
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 18mm;">Codigo</th>
            <th style="width: 17mm;" class="cell-right">Cantidad</th>
            <th>Detalle</th>
            <th style="width: 15mm;" class="cell-center">Unidad</th>
            <th style="width: 17mm;" class="cell-right">Kgs</th>
            <th style="width: 24mm;" class="cell-right">Precio</th>
            <th style="width: 15mm;" class="cell-right">Desc.</th>
            <th style="width: 26mm;" class="cell-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          ${buildItemsRows(page.items)}
        </tbody>
      </table>
    </section>
  `;
}

function buildAssociatedDocumentsHtml(data: CreditNotePDFData): string {
  return `
    <section class="source-documents">
      <div class="block-title">Comprobantes asociados</div>
      <table class="source-table">
        <thead>
          <tr>
            <th>Comprobante</th>
            <th class="cell-center">Fecha</th>
            <th class="cell-right">Importe aplicado</th>
          </tr>
        </thead>
        <tbody>
          ${buildSourceDocumentsRows(data)}
        </tbody>
      </table>
    </section>
  `;
}

function buildNotesHtml(data: CreditNotePDFData): string {
  if (!data.observations?.trim()) {
    return "";
  }

  return `
    <section class="notes-block">
      <strong>Observaciones:</strong> ${displayValue(data.observations, "")}
    </section>
  `;
}

function buildContinuationHeader(
  data: CreditNotePDFData,
  page: CreditNotePDFPage
) {
  const displayNumber =
    data.fiscal.isAuthorized && data.fiscal.number
      ? data.fiscal.number
      : data.creditNoteNumber;

  return `
    <header class="continuation-header">
      <div>
        <strong>${displayValue(getInvoiceTypeDisplay(data))} Numero ${displayValue(displayNumber)}</strong>
        <span>${displayValue(data.customer.businessName)} - CAE ${displayValue(data.fiscal.cae)}</span>
      </div>
      <div>Pag. ${page.pageNumber}/${page.totalPages}</div>
    </header>
  `;
}

export async function generateCreditNoteHTML(
  data: CreditNotePDFData
): Promise<string> {
  const pages = paginateItems(data.items);
  const qrDataUrl = await generateCreditNoteQrDataUrl(data);

  const renderPage = (page: CreditNotePDFPage) => `
    <div class="document-copy">
      <div class="sheet">
        ${
          data.issuer.logoUrl
            ? `<img src="${escapeHtml(data.issuer.logoUrl)}" alt="" aria-hidden="true" class="watermark" />`
            : ""
        }
        ${page.isFirstPage ? buildHeaderHtml(data) : buildContinuationHeader(data, page)}
        ${page.isFirstPage ? buildCustomerHtml(data, qrDataUrl) : ""}
        ${buildItemsTableHtml(page)}
        ${page.isLastPage ? buildAssociatedDocumentsHtml(data) : ""}
        ${page.isLastPage ? buildSummaryHtml(data) : ""}
        ${page.isLastPage ? buildNotesHtml(data) : ""}
        ${buildFiscalFooterHtml(data, qrDataUrl)}
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>${displayValue(getInvoiceTypeDisplay(data))} ${displayValue(data.fiscal.number ?? data.creditNoteNumber, "sin-numero")}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #111111;
    background: #ffffff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5px;
    line-height: 1.25;
  }
  .document-copy {
    width: 210mm;
    height: 297mm;
    padding: 4mm;
    background: #ffffff;
    page-break-after: always;
  }
  .document-copy:last-child { page-break-after: auto; }
  .sheet {
    position: relative;
    height: 289mm;
    border: 1px solid #111111;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #ffffff;
  }
  .sheet > * {
    position: relative;
    z-index: 1;
  }
  .watermark {
    position: absolute;
    left: 50%;
    top: 52%;
    width: 135mm;
    max-height: 92mm;
    transform: translate(-50%, -50%);
    object-fit: contain;
    opacity: 0.06;
    filter: grayscale(100%);
    z-index: 0;
  }
  .invoice-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34mm minmax(0, 1fr);
    min-height: 38mm;
    border-bottom: 1px solid #111111;
  }
  .issuer-panel,
  .letter-panel {
    border-right: 1px solid #111111;
  }
  .issuer-panel {
    padding: 7px 10px 6px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-width: 0;
  }
  .issuer-main {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    min-width: 0;
  }
  .issuer-logo {
    width: 28mm;
    max-height: 15mm;
    object-fit: contain;
    object-position: left top;
    flex-shrink: 0;
  }
  .issuer-panel h1 {
    margin: 0 0 3px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 24px;
    line-height: 1.05;
    font-weight: 700;
  }
  .issuer-panel p {
    margin: 2px 0;
    font-size: 10px;
  }
  .issuer-tax {
    margin-top: 5px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 15px;
    font-style: italic;
    text-align: center;
  }
  .letter-panel {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 5px;
  }
  .letter-box {
    width: 23mm;
    height: 23mm;
    border: 1px solid #111111;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .letter-value {
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
  }
  .letter-code {
    margin-top: 5px;
    font-size: 10px;
  }
  .voucher-panel {
    padding: 8px 10px 7px;
    min-width: 0;
  }
  .voucher-number {
    text-align: right;
    font-size: 13px;
    margin-bottom: 8px;
  }
  .voucher-panel h2 {
    margin: 0 0 3px;
    font-size: 17px;
    line-height: 1.1;
    font-weight: 400;
    text-transform: uppercase;
  }
  .voucher-subtitle {
    margin-bottom: 9px;
    color: #333333;
  }
  .voucher-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
  }
  .voucher-row span,
  .customer-cell span {
    color: #333333;
  }
  .customer-block {
    border-bottom: 1px solid #111111;
  }
  .customer-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.95fr) 39mm;
    min-height: 42mm;
  }
  .customer-cell {
    padding: 8px 10px;
    border-right: 1px solid #111111;
    display: grid;
    align-content: start;
    gap: 5px;
    min-width: 0;
  }
  .customer-cell div {
    display: grid;
    grid-template-columns: 24mm minmax(0, 1fr);
    gap: 7px;
    align-items: baseline;
  }
  .customer-main strong,
  .customer-cell strong {
    font-size: 12px;
    font-weight: 400;
    word-break: break-word;
  }
  .customer-qr-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 5px;
  }
  .customer-qr {
    width: 30mm;
    height: 30mm;
    object-fit: contain;
  }
  .customer-qr-empty {
    width: 30mm;
    height: 30mm;
    border: 1px solid #777777;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 4px;
    color: #555555;
    font-size: 9px;
  }
  .block-title {
    padding: 3px 6px;
    border-bottom: 1px solid #111111;
    background: #eeeeee;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 9.5px;
  }
  .items-block {
    border-bottom: 1px solid #111111;
    flex: 1 1 auto;
    min-height: 96mm;
    display: flex;
    flex-direction: column;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  .items-table {
    flex: 1 1 auto;
  }
  th,
  td {
    padding: 4px 5px;
    border-right: 1px solid #111111;
    vertical-align: top;
  }
  th {
    border-bottom: 1px solid #111111;
    font-size: 10px;
    font-weight: 400;
    text-align: left;
    background: #f5f5f5;
  }
  td {
    font-size: 9.5px;
  }
  th:last-child,
  td:last-child {
    border-right: none;
  }
  .items-table tbody td {
    border-bottom: none;
  }
  .cell-right { text-align: right; }
  .cell-center { text-align: center; }
  .cell-code {
    font-family: "Courier New", monospace;
    white-space: nowrap;
  }
  .cell-detail {
    word-break: break-word;
  }
  .cell-amount {
    white-space: nowrap;
  }
  .source-documents {
    border-bottom: 1px solid #111111;
    flex: 0 0 auto;
  }
  .source-table th,
  .source-table td {
    border-bottom: 1px solid #dddddd;
  }
  .source-table tbody tr:last-child td {
    border-bottom: none;
  }
  .closing-block {
    border-bottom: 1px solid #111111;
    flex: 0 0 auto;
  }
  .reason-row {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    min-height: 22mm;
    border-bottom: 1px solid #111111;
  }
  .reason-label {
    padding: 8px 10px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .amount-text {
    padding: 8px 10px;
    align-self: center;
    font-size: 10.5px;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 52mm;
  }
  .summary-table-wrap {
    border-right: 1px solid #111111;
  }
  .compact-summary td {
    padding: 4px 8px;
    border-bottom: 1px solid #dddddd;
  }
  .compact-summary tr:last-child td {
    border-bottom: none;
  }
  .total-box {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    font-size: 12px;
  }
  .total-box strong {
    font-size: 13px;
  }
  .notes-block {
    padding: 5px 8px;
    border-bottom: 1px solid #111111;
    font-size: 9px;
  }
  .fiscal-footer {
    min-height: 25mm;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 78mm;
    gap: 8px;
    align-items: end;
    padding: 7px 10px;
    margin-top: auto;
  }
  .footer-left {
    display: flex;
    align-items: flex-end;
    gap: 9px;
  }
  .footer-qr {
    width: 20mm;
    height: 20mm;
    object-fit: contain;
  }
  .footer-qr-placeholder {
    width: 36mm;
    height: 15mm;
    border: 1px solid #777777;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555555;
    font-size: 9px;
  }
  .footer-status {
    margin-bottom: 5px;
    font-weight: 700;
  }
  .footer-right {
    text-align: right;
    font-size: 12px;
    line-height: 1.45;
  }
  .continuation-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid #111111;
  }
  .continuation-header strong,
  .continuation-header span {
    display: block;
  }
  .continuation-header span {
    margin-top: 2px;
    color: #333333;
  }
  @page { size: A4; margin: 0; }
</style>
</head>
<body>
  ${pages.map(renderPage).join("")}
</body>
</html>`;
}
