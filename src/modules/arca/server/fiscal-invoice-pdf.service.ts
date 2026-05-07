import "server-only";

import QRCode from "qrcode";
import { remittanceIssuerConfig } from "@/config/remittance";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { getCustomerTaxConditionLabel } from "@/modules/customers/tax-conditions";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getInvoiceTypeLabel,
  getInvoiceTypeLetter,
} from "@/modules/sales/invoice-type-utils";
import {
  getSalesOrderById,
  type SalesOrderDetail,
} from "@/modules/sales/service/sales.service";
import type { Json } from "@/types/supabase";
import { ArcaValidationError } from "../errors";
import { getOrganizationArcaSettingsByOrganizationId } from "./repository";

type OrganizationSummary = {
  name: string | null | undefined;
  cuit: string | null | undefined;
};

type StoredWsfeRequest = {
  DocTipo?: number;
  DocNro?: number;
  CbteFch?: number;
  MonId?: string;
  MonCotiz?: number;
};

type PrintableFiscalInvoice = {
  filename: string;
  html: string;
};

type ArcaInvoiceBranding = {
  issuerLogoUrl: string | null;
};

type ArcaQrPayload = {
  ver: 1;
  fecha: string;
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string;
  ctz: number;
  tipoDocRec?: number;
  nroDocRec?: number;
  tipoCodAut: "E";
  codAut: number;
};

const TRAILING_ZERO_DECIMALS_REGEX = /\.00$/;
const ARCA_DATE_NUMBER_REGEX = /^\d{8}$/;

function escapeHtml(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayValue(
  value: string | null | undefined,
  fallback = "—"
): string {
  const trimmed = value?.trim();
  return escapeHtml(trimmed || fallback);
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function asRecord(value: Json | null | undefined): Record<string, Json> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, Json>;
}

function extractWsfeRequest(
  value: Json | null | undefined
): StoredWsfeRequest | null {
  const root = asRecord(value);
  const wsfeRequest = asRecord(root?.wsfeRequest ?? null);

  if (!wsfeRequest) {
    return null;
  }

  const docType =
    typeof wsfeRequest.DocTipo === "number" ? wsfeRequest.DocTipo : undefined;
  const docNumber =
    typeof wsfeRequest.DocNro === "number" ? wsfeRequest.DocNro : undefined;
  const cbteDate =
    typeof wsfeRequest.CbteFch === "number" ? wsfeRequest.CbteFch : undefined;
  const currency =
    typeof wsfeRequest.MonId === "string" ? wsfeRequest.MonId : undefined;
  const quote =
    typeof wsfeRequest.MonCotiz === "number" ? wsfeRequest.MonCotiz : undefined;

  return {
    DocTipo: docType,
    DocNro: docNumber,
    CbteFch: cbteDate,
    MonId: currency,
    MonCotiz: quote,
  };
}

function formatArcaDateNumberToIso(
  dateNumber: number | undefined
): string | null {
  if (!dateNumber) {
    return null;
  }

  const raw = String(dateNumber).padStart(8, "0");

  if (!ARCA_DATE_NUMBER_REGEX.test(raw)) {
    return null;
  }

  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function formatTaxAmountLabel(name: string, rate: number): string {
  const normalizedRate = Number.isInteger(rate)
    ? String(rate)
    : String(rate).replace(".", ",");

  return `${name} (${normalizedRate}%)`;
}

function formatDiscountPercent(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(".", ",");
}

function formatQuantityValue(value: number): string {
  return value.toFixed(2).replace(TRAILING_ZERO_DECIMALS_REGEX, "") || "0";
}

function getVoucherTypeCodeLabel(value: number | null | undefined): string {
  if (!value) {
    return "—";
  }

  return String(value).padStart(3, "0");
}

function getPaymentConditionLabel(sale: SalesOrderDetail): string {
  if (sale.credit_days && sale.credit_days > 0) {
    return `Cuenta corriente ${sale.credit_days} días`;
  }

  return "Contado";
}

function resolveIssuerLogoUrl(
  branding: ArcaInvoiceBranding | null | undefined
): string | null {
  const customLogo = branding?.issuerLogoUrl?.trim();

  if (customLogo) {
    return customLogo;
  }

  return remittanceIssuerConfig.logoUrl;
}

function buildArcaQrPayload(params: {
  sale: SalesOrderDetail;
  organization: OrganizationSummary;
  request: StoredWsfeRequest | null;
}): ArcaQrPayload {
  const issuerCuit = Number(
    (params.organization.cuit ?? "").replace(/\D/g, "")
  );
  const issueDate =
    formatArcaDateNumberToIso(params.request?.CbteFch) ??
    params.sale.arca_authorized_at?.slice(0, 10) ??
    params.sale.sale_date.slice(0, 10);

  if (!Number.isFinite(issuerCuit) || issuerCuit <= 0) {
    throw new ArcaValidationError(
      "La organización no tiene un CUIT válido para generar el QR fiscal."
    );
  }

  if (
    !(
      params.sale.arca_point_of_sale &&
      params.sale.arca_voucher_number &&
      params.sale.arca_voucher_type_code &&
      params.sale.arca_cae
    )
  ) {
    throw new ArcaValidationError(
      "La venta no tiene todos los datos fiscales necesarios para generar el QR."
    );
  }

  const payload: ArcaQrPayload = {
    ver: 1,
    fecha: issueDate,
    cuit: issuerCuit,
    ptoVta: params.sale.arca_point_of_sale,
    tipoCmp: params.sale.arca_voucher_type_code,
    nroCmp: params.sale.arca_voucher_number,
    importe: truncateMoney(params.sale.total_amount),
    moneda: params.request?.MonId ?? "PES",
    ctz: params.request?.MonCotiz ?? 1,
    tipoCodAut: "E",
    codAut: Number(params.sale.arca_cae),
  };

  if (typeof params.request?.DocTipo === "number") {
    payload.tipoDocRec = params.request.DocTipo;
  }

  if (typeof params.request?.DocNro === "number") {
    payload.nroDocRec = params.request.DocNro;
  }

  return payload;
}

function buildArcaQrVerifierUrl(payload: ArcaQrPayload): string {
  const base64Payload = Buffer.from(JSON.stringify(payload), "utf-8").toString(
    "base64"
  );

  return `https://www.arca.gob.ar/fe/qr/?p=${encodeURIComponent(base64Payload)}`;
}

function generateFiscalQrDataUrl(verificationUrl: string): Promise<string> {
  return QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 180,
  });
}

function generateInvoiceItemsRows(sale: SalesOrderDetail): string {
  return sale.items
    .map((item) => {
      const quantityLabel = formatQuantityValue(item.quantity);
      const weightLabel =
        item.weightQuantity !== null && item.weightQuantity !== undefined
          ? formatQuantityValue(item.weightQuantity)
          : null;

      return `
        <tr>
          <td class="cell-code">${displayValue(item.sku)}</td>
          <td class="cell-description">
            <div class="item-name">${displayValue(item.name)}</div>
            ${item.brand ? `<div class="item-secondary">${displayValue(item.brand)}</div>` : ""}
            ${item.description ? `<div class="item-secondary">${displayValue(item.description)}</div>` : ""}
          </td>
          <td class="cell-right">${quantityLabel}</td>
          <td class="cell-center">${displayValue(item.unitOfMeasure)}</td>
          <td class="cell-right">${weightLabel ?? "—"}</td>
          <td class="cell-right">${formatCurrency(item.unitPrice)}</td>
          <td class="cell-right">${formatDiscountPercent(item.discountPercent)}</td>
          <td class="cell-right cell-amount">${formatCurrency(item.subtotal)}</td>
        </tr>
      `;
    })
    .join("");
}

function generateTaxesRows(sale: SalesOrderDetail): string {
  if (sale.taxes.length === 0) {
    return `
      <tr>
        <td>Impuestos</td>
        <td class="cell-right">${formatCurrency(0)}</td>
      </tr>
    `;
  }

  return sale.taxes
    .map(
      (tax) => `
        <tr>
          <td>${escapeHtml(formatTaxAmountLabel(tax.name, tax.rate))}</td>
          <td class="cell-right">${formatCurrency(tax.taxAmount)}</td>
        </tr>
      `
    )
    .join("");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the printable fiscal template is intentionally defined in one place for layout coherence
async function generateFiscalInvoiceHtml(params: {
  sale: SalesOrderDetail;
  organization: OrganizationSummary;
  branding: ArcaInvoiceBranding;
}): Promise<string> {
  const { sale, organization, branding } = params;

  if (sale.arca_status !== "authorized") {
    throw new ArcaValidationError(
      "La venta todavía no tiene una factura fiscal autorizada para imprimir."
    );
  }

  const request = extractWsfeRequest(sale.arca_request_json);
  const qrPayload = buildArcaQrPayload({
    sale,
    organization,
    request,
  });
  const qrVerificationUrl = buildArcaQrVerifierUrl(qrPayload);
  const qrDataUrl = await generateFiscalQrDataUrl(qrVerificationUrl);
  const invoiceTypeLabel = getInvoiceTypeLabel(sale.invoice_type);
  const invoiceLegend =
    sale.invoice_type === "FACTURA_A_RETENCION"
      ? "Operación sujeta a retención"
      : null;
  const issueDate =
    formatArcaDateNumberToIso(request?.CbteFch) ??
    sale.arca_authorized_at?.slice(0, 10) ??
    sale.sale_date;
  const customerTaxCondition =
    getCustomerTaxConditionLabel(sale.customer.tax_condition) ??
    sale.customer.tax_condition ??
    "No informada";
  const issuerLogoUrl = resolveIssuerLogoUrl(branding);
  const customerName =
    sale.customer.business_name?.trim() ||
    sale.customer.fantasy_name?.trim() ||
    "Cliente";
  const customerAddress =
    [sale.customer.address, sale.customer.city].filter(Boolean).join(" - ") ||
    "No informado";
  const pointOfSaleLabel = sale.arca_point_of_sale
    ? String(sale.arca_point_of_sale).padStart(5, "0")
    : "—";
  const voucherNumberLabel = sale.arca_voucher_number
    ? String(sale.arca_voucher_number).padStart(8, "0")
    : "—";
  const voucherTypeCodeLabel = getVoucherTypeCodeLabel(
    sale.arca_voucher_type_code
  );
  const paymentConditionLabel = getPaymentConditionLabel(sale);
  const pointAndNumber =
    sale.arca_point_of_sale && sale.arca_voucher_number
      ? `${String(sale.arca_point_of_sale).padStart(4, "0")}-${String(
          sale.arca_voucher_number
        ).padStart(8, "0")}`
      : (sale.invoice_number ?? "—");

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(invoiceTypeLabel)} ${displayValue(sale.invoice_number, "sin-numero")}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      background: #ffffff;
      font-family: "Arial", "Helvetica", sans-serif;
      font-size: 11px;
      line-height: 1.3;
    }
    .document-copy {
      width: 210mm;
      min-height: 297mm;
      padding: 6mm;
      background: #ffffff;
    }
    .sheet {
      position: relative;
      min-height: 285mm;
      border: 1px solid #4b5563;
      padding: 6mm 7mm 7mm;
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
      top: 50%;
      width: 140mm;
      max-height: 100mm;
      transform: translate(-50%, -42%);
      object-fit: contain;
      opacity: 0.05;
      filter: grayscale(100%);
      z-index: 0;
    }
    .invoice-header {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) 44mm minmax(0, 1.05fr);
      border: 1px solid #4b5563;
      background: #ffffff;
    }
    .issuer-panel,
    .letter-panel,
    .voucher-panel {
      min-height: 48mm;
    }
    .issuer-panel {
      padding: 10px 11px;
      border-right: 1px solid #4b5563;
    }
    .issuer-brand {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 10px;
    }
    .issuer-logo {
      width: 34mm;
      max-height: 18mm;
      object-fit: contain;
      object-position: left center;
      flex-shrink: 0;
    }
    .issuer-name {
      margin: 0;
      font-size: 21px;
      font-weight: 700;
      line-height: 1.12;
    }
    .issuer-subtitle {
      margin: 4px 0 0;
      color: #374151;
      font-size: 13px;
      font-style: italic;
    }
    .issuer-meta {
      display: grid;
      gap: 4px;
      font-size: 11px;
    }
    .meta-line {
      display: flex;
      gap: 6px;
      align-items: flex-start;
    }
    .meta-key {
      min-width: 112px;
      color: #4b5563;
    }
    .meta-value {
      font-weight: 600;
    }
    .letter-panel {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      flex-direction: column;
      gap: 8px;
      padding: 6px 5px 8px;
      border-right: 1px solid #4b5563;
    }
    .letter-box {
      width: 34mm;
      height: 27mm;
      border: 1px solid #4b5563;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .letter-value {
      font-size: 27px;
      font-weight: 700;
      line-height: 1;
    }
            .letter-code {
      margin-top: 4px;
      font-size: 10px;
      font-weight: 700;
    }
    .letter-legend {
      text-align: center;
      font-size: 8px;
      font-weight: 700;
      line-height: 1.2;
      text-transform: uppercase;
    }
    .voucher-panel {
      padding: 8px 10px 10px;
    }
    .voucher-heading {
      margin: 0 0 5px;
      font-size: 23px;
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1.05;
    }
    .voucher-number {
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 700;
    }
    .voucher-grid {
      display: grid;
      gap: 4px;
    }
    .voucher-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      border-bottom: 1px solid #d1d5db;
      padding-bottom: 2px;
    }
    .voucher-row span {
      color: #4b5563;
    }
    .detail-block {
      margin-top: 6px;
      border: 1px solid #4b5563;
    }
    .block-title {
      padding: 4px 6px;
      border-bottom: 1px solid #4b5563;
      background: #ececec;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr 0.8fr 1.2fr;
    }
    .detail-cell {
      min-height: 31px;
      padding: 5px 6px;
      border-right: 1px solid #d1d5db;
      border-bottom: 1px solid #e5e7eb;
    }
    .detail-cell:nth-child(4n) {
      border-right: none;
    }
    .detail-label {
      display: block;
      margin-bottom: 2px;
      color: #4b5563;
      font-size: 10px;
    }
    .detail-value {
      display: block;
      font-weight: 700;
      word-break: break-word;
    }
    .table-wrap {
      margin-top: 6px;
      border: 1px solid #4b5563;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead {
      background: #e5e7eb;
    }
    th,
    td {
      padding: 5px 6px;
      border-right: 1px solid #d1d5db;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
      font-size: 10px;
    }
    th {
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #111827;
      text-align: left;
      font-weight: 700;
    }
    th:last-child,
    td:last-child {
      border-right: none;
    }
    tbody tr:last-child td {
      border-bottom: none;
    }
    .cell-right { text-align: right; }
    .cell-center { text-align: center; }
    .cell-code {
      font-family: "Courier New", monospace;
      font-size: 10px;
      white-space: nowrap;
    }
    .item-name {
      font-weight: 700;
    }
    .item-secondary {
      margin-top: 1px;
      color: #6b7280;
    }
    .cell-amount {
      font-weight: 700;
    }
    .summary-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      gap: 6px;
      margin-top: 6px;
      align-items: stretch;
    }
    .summary-card {
      border: 1px solid #4b5563;
    }
    .summary-body {
      padding: 6px 7px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 3px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .summary-row:last-child {
      border-bottom: none;
    }
    .summary-label {
      color: #4b5563;
    }
    .summary-notes {
      margin-top: 8px;
      padding-top: 7px;
      border-top: 1px solid #d1d5db;
    }
    .summary-notes-title {
      margin: 0 0 3px;
      font-size: 10px;
      color: #4b5563;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .summary-notes-copy {
      margin: 0;
      color: #374151;
      font-size: 10px;
      white-space: pre-wrap;
    }
    .totals-table td {
      padding: 5px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 11px;
    }
    .totals-table tr:last-child td {
      padding-top: 8px;
      border-bottom: none;
      font-size: 15px;
      font-weight: 700;
    }
    .totals-table td:first-child {
      color: #374151;
    }
    .footer-bar {
      display: grid;
      grid-template-columns: 58mm 1fr 74mm;
      gap: 8px;
      align-items: end;
      margin-top: 7px;
    }
    .footer-qr {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    .footer-qr img {
      width: 28mm;
      height: 28mm;
      border: 1px solid #d1d5db;
      padding: 2mm;
      background: #ffffff;
    }
    .footer-qr-copy {
      min-width: 0;
    }
    .footer-qr-brand {
      margin: 0;
      font-size: 19px;
      font-weight: 700;
      line-height: 1;
    }
    .footer-qr-caption {
      margin: 4px 0 0;
      font-size: 11px;
      font-weight: 700;
    }
    .footer-note {
      margin: 4px 0 0;
      color: #6b7280;
      font-size: 9px;
      line-height: 1.25;
    }
    .footer-center {
      padding-bottom: 2px;
      text-align: center;
    }
    .footer-page {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
    }
    .footer-copy {
      margin: 4px 0 0;
      color: #4b5563;
      font-size: 9px;
      line-height: 1.3;
    }
    .footer-right {
      padding-bottom: 2px;
      text-align: right;
    }
    .footer-right-row {
      margin: 0 0 4px;
      font-size: 11px;
    }
    .footer-right-row strong {
      font-size: 12px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="document-copy">
    <div class="sheet">
      ${issuerLogoUrl ? `<img src="${escapeHtml(issuerLogoUrl)}" alt="" aria-hidden="true" class="watermark" />` : ""}

      <header class="invoice-header">
        <section class="issuer-panel">
          <div class="issuer-brand">
            ${issuerLogoUrl ? `<img src="${escapeHtml(issuerLogoUrl)}" alt="Logo del emisor" class="issuer-logo" />` : ""}
            <div>
              <h1 class="issuer-name">${displayValue(organization.name, "Organización")}</h1>
              <p class="issuer-subtitle">Comprobante autorizado por ARCA</p>
            </div>
          </div>
          <div class="issuer-meta">
            <div class="meta-line"><span class="meta-key">Razón social:</span><span class="meta-value">${displayValue(organization.name, "Organización")}</span></div>
            <div class="meta-line"><span class="meta-key">Domicilio comercial:</span><span class="meta-value">${displayValue(remittanceIssuerConfig.legalAddress, "No informado")}</span></div>
            <div class="meta-line"><span class="meta-key">CUIT:</span><span class="meta-value">${displayValue(organization.cuit)}</span></div>
          </div>
        </section>

        <section class="letter-panel">
          <div class="letter-box">
            <div class="letter-value">${escapeHtml(getInvoiceTypeLetter(sale.invoice_type))}</div>
            <div class="letter-code">Cod. ${escapeHtml(voucherTypeCodeLabel)}</div>
          </div>
          ${invoiceLegend ? `<div class="letter-legend">${escapeHtml(invoiceLegend)}</div>` : ""}
        </section>

        <section class="voucher-panel">
          <h2 class="voucher-heading">${escapeHtml(invoiceTypeLabel)}</h2>
          <p class="voucher-number">Nº ${escapeHtml(pointAndNumber)}</p>
          <div class="voucher-grid">
            <div class="voucher-row"><span>Punto de venta</span><strong>${escapeHtml(pointOfSaleLabel)}</strong></div>
            <div class="voucher-row"><span>Comp. nro.</span><strong>${escapeHtml(voucherNumberLabel)}</strong></div>
            <div class="voucher-row"><span>Fecha de emisión</span><strong>${formatDateOnly(issueDate)}</strong></div>
            <div class="voucher-row"><span>Fecha de venta</span><strong>${formatDateOnly(sale.sale_date)}</strong></div>
            <div class="voucher-row"><span>Venta interna</span><strong>#${sale.sale_number ?? "—"}</strong></div>
            <div class="voucher-row"><span>Moneda</span><strong>ARS</strong></div>
          </div>
        </section>
      </header>

      <section class="detail-block">
        <div class="block-title">Datos del receptor</div>
        <div class="detail-grid">
          <div class="detail-cell">
            <span class="detail-label">Cliente</span>
            <span class="detail-value">${displayValue(customerName)}</span>
          </div>
          <div class="detail-cell">
            <span class="detail-label">Documento</span>
            <span class="detail-value">${displayValue(sale.customer.cuit)}</span>
          </div>
          <div class="detail-cell">
            <span class="detail-label">Condición frente al IVA</span>
            <span class="detail-value">${displayValue(customerTaxCondition)}</span>
          </div>
          <div class="detail-cell">
            <span class="detail-label">Domicilio comercial</span>
            <span class="detail-value">${displayValue(customerAddress)}</span>
          </div>
        </div>
      </section>

      <section class="detail-block">
        <div class="block-title">Datos complementarios</div>
        <div class="detail-grid">
          <div class="detail-cell">
            <span class="detail-label">Condición de venta</span>
            <span class="detail-value">${escapeHtml(paymentConditionLabel)}</span>
          </div>
          <div class="detail-cell">
            <span class="detail-label">Vendedor</span>
            <span class="detail-value">${displayValue(sale.seller?.name ?? sale.seller?.email, "No informado")}</span>
          </div>
          <div class="detail-cell">
            <span class="detail-label">Remito</span>
            <span class="detail-value">${displayValue(sale.remittance_number)}</span>
          </div>
          <div class="detail-cell">
            <span class="detail-label">Estado fiscal</span>
            <span class="detail-value">Autorizada</span>
          </div>
        </div>
      </section>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 18mm;">Código</th>
              <th>Producto / Servicio</th>
              <th style="width: 14mm;" class="cell-right">Cant.</th>
              <th style="width: 18mm;" class="cell-center">U. medida</th>
              <th style="width: 15mm;" class="cell-right">Kgs</th>
              <th style="width: 22mm;" class="cell-right">Precio Unit.</th>
              <th style="width: 15mm;" class="cell-right">% Bonif</th>
              <th style="width: 24mm;" class="cell-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${generateInvoiceItemsRows(sale)}
          </tbody>
        </table>
      </div>

      <div class="summary-layout">
        <section class="summary-card">
          <div class="block-title">Datos de la operación</div>
          <div class="summary-body">
            <div class="summary-row"><span class="summary-label">CAE</span><strong>${displayValue(sale.arca_cae)}</strong></div>
            <div class="summary-row"><span class="summary-label">Vencimiento CAE</span><strong>${sale.arca_cae_expires_at ? formatDateOnly(sale.arca_cae_expires_at) : "—"}</strong></div>
            <div class="summary-row"><span class="summary-label">Autorizada el</span><strong>${sale.arca_authorized_at ? formatDateOnly(sale.arca_authorized_at) : "—"}</strong></div>
            <div class="summary-row"><span class="summary-label">Punto y número</span><strong>${escapeHtml(pointAndNumber)}</strong></div>
            <div class="summary-row"><span class="summary-label">Condición de venta</span><strong>${escapeHtml(paymentConditionLabel)}</strong></div>
            <div class="summary-row"><span class="summary-label">QR fiscal</span><strong>Disponible</strong></div>
            ${
              sale.observations
                ? `
            <div class="summary-notes">
              <p class="summary-notes-title">Observaciones</p>
              <p class="summary-notes-copy">${displayValue(sale.observations)}</p>
            </div>
            `
                : ""
            }
          </div>
        </section>

        <section class="summary-card">
          <div class="block-title">Totales</div>
          <div class="summary-body">
            <table class="totals-table">
              <tbody>
                <tr>
                  <td>Importe neto gravado</td>
                  <td class="cell-right">${formatCurrency(sale.sub_total ?? 0)}</td>
                </tr>
                ${
                  sale.global_discount_amount && sale.global_discount_amount > 0
                    ? `
                <tr>
                  <td>Bonificación global</td>
                  <td class="cell-right">-${formatCurrency(sale.global_discount_amount)}</td>
                </tr>
                `
                    : ""
                }
                ${generateTaxesRows(sale)}
                <tr>
                  <td>Importe total</td>
                  <td class="cell-right">${formatCurrency(sale.total_amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer class="footer-bar">
        <div class="footer-qr">
          <img src="${qrDataUrl}" alt="QR fiscal ARCA" />
          <div class="footer-qr-copy">
            <p class="footer-qr-brand">ARCA</p>
            <p class="footer-qr-caption">Comprobante autorizado</p>
            <p class="footer-note">
              Escaneá el QR para validar este comprobante en ARCA.
            </p>
          </div>
        </div>

        <div class="footer-center">
          <p class="footer-page">Pág. 1/1</p>
          <p class="footer-copy">
            Conservá el CAE y el QR fiscal para su validación.
          </p>
        </div>

        <div class="footer-right">
          <p class="footer-right-row">CAE Nº: <strong>${displayValue(sale.arca_cae)}</strong></p>
          <p class="footer-right-row">Fecha de Vto. de CAE: <strong>${sale.arca_cae_expires_at ? formatDateOnly(sale.arca_cae_expires_at) : "—"}</strong></p>
        </div>
      </footer>
    </div>
  </div>
</body>
</html>
  `;
}

export async function generateAuthorizedSaleInvoicePdf(params: {
  orgSlug: string;
  saleId: string;
}): Promise<PrintableFiscalInvoice> {
  const [sale, organization] = await Promise.all([
    getSalesOrderById(params.orgSlug, params.saleId),
    getOrganizationBySlug(params.orgSlug),
  ]);

  if (!sale) {
    throw new ArcaValidationError("Venta no encontrada.");
  }

  if (!organization) {
    throw new ArcaValidationError("Organización no encontrada.");
  }

  const arcaSettings = await getOrganizationArcaSettingsByOrganizationId(
    organization.id
  );

  const html = await generateFiscalInvoiceHtml({
    sale,
    organization,
    branding: {
      issuerLogoUrl: arcaSettings?.issuer_logo_data_url ?? null,
    },
  });
  const filename = `Factura_${sanitizeFilenamePart(
    sale.invoice_number ?? String(sale.sale_number ?? sale.id)
  )}.pdf`;

  return {
    filename,
    html,
  };
}
