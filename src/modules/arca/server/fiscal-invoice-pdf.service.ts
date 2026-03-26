import "server-only";

import QRCode from "qrcode";
import { remittanceIssuerConfig } from "@/config/remittance";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { getCustomerTaxConditionLabel } from "@/modules/customers/tax-conditions";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getSalesOrderById,
  type SalesOrderDetail,
} from "@/modules/sales/service/sales.service";
import type { Json } from "@/types/supabase";
import { ArcaValidationError } from "../errors";

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

const INVOICE_TYPE_LABELS: Record<SalesOrderDetail["invoice_type"], string> = {
  FACTURA_A: "Factura A",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  FACTURA_E: "Factura E",
  NOTA_DE_VENTA: "Nota de venta",
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

function getInvoiceLetter(
  invoiceType: SalesOrderDetail["invoice_type"]
): string {
  if (invoiceType === "FACTURA_A") {
    return "A";
  }

  if (invoiceType === "FACTURA_B") {
    return "B";
  }

  if (invoiceType === "FACTURA_C") {
    return "C";
  }

  return "X";
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
      const quantityLabel =
        item.quantity.toFixed(2).replace(TRAILING_ZERO_DECIMALS_REGEX, "") ||
        "0";
      const weightLabel =
        item.weightQuantity !== null && item.weightQuantity !== undefined
          ? item.weightQuantity
              .toFixed(2)
              .replace(TRAILING_ZERO_DECIMALS_REGEX, "")
          : null;

      return `
        <tr>
          <td class="cell-code">${displayValue(item.sku)}</td>
          <td>
            <div class="item-name">${displayValue(item.name)}</div>
            ${item.brand ? `<div class="muted">${displayValue(item.brand)}</div>` : ""}
            ${item.description ? `<div class="muted">${displayValue(item.description)}</div>` : ""}
          </td>
          <td class="cell-right">${quantityLabel}</td>
          <td class="cell-center">${displayValue(item.unitOfMeasure)}</td>
          <td class="cell-right">${weightLabel ? `${weightLabel}` : "—"}</td>
          <td class="cell-right">${formatCurrency(item.unitPrice)}</td>
          <td class="cell-right strong">${formatCurrency(item.subtotal)}</td>
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

async function generateFiscalInvoiceHtml(params: {
  sale: SalesOrderDetail;
  organization: OrganizationSummary;
}): Promise<string> {
  const { sale, organization } = params;

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
  const invoiceTypeLabel = INVOICE_TYPE_LABELS[sale.invoice_type];
  const issueDate =
    formatArcaDateNumberToIso(request?.CbteFch) ??
    sale.arca_authorized_at?.slice(0, 10) ??
    sale.sale_date;
  const customerTaxCondition =
    getCustomerTaxConditionLabel(sale.customer.tax_condition) ??
    sale.customer.tax_condition ??
    "No informada";
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
      color: #0f172a;
      background: #ffffff;
      font-family: "Helvetica", "Arial", sans-serif;
      font-size: 12px;
      line-height: 1.45;
    }
    .document-copy {
      width: 210mm;
      min-height: 297mm;
      padding: 16mm 14mm 12mm;
      background: #ffffff;
    }
    .header {
      display: grid;
      grid-template-columns: 1.5fr 0.8fr;
      gap: 14px;
      align-items: stretch;
    }
    .issuer-card,
    .voucher-card,
    .section-card,
    .qr-card,
    .totals-card {
      border: 1px solid #dbe3ef;
      border-radius: 14px;
      background: #ffffff;
    }
    .issuer-card,
    .voucher-card {
      padding: 16px 18px;
    }
    .issuer-head {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 10px;
    }
    .issuer-logo {
      width: 64px;
      height: 64px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .issuer-title {
      font-size: 24px;
      font-weight: 800;
      margin: 0 0 4px;
    }
    .issuer-subtitle {
      color: #475569;
      margin: 0;
    }
    .voucher-card {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background:
        radial-gradient(circle at top right, rgba(59, 130, 246, 0.10), transparent 42%),
        #ffffff;
    }
    .letter-badge {
      width: 58px;
      height: 58px;
      border-radius: 16px;
      border: 1px solid #1d4ed8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 800;
      color: #1d4ed8;
      margin-left: auto;
    }
    .voucher-title {
      margin: 10px 0 2px;
      font-size: 24px;
      font-weight: 800;
    }
    .voucher-type {
      color: #475569;
      margin: 0 0 12px;
    }
    .meta-grid {
      display: grid;
      gap: 6px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px dashed #dbe3ef;
      padding-bottom: 4px;
    }
    .meta-label {
      color: #64748b;
    }
    .section-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 14px;
    }
    .section-card {
      padding: 14px 16px;
    }
    .section-title {
      margin: 0 0 10px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #334155;
    }
    .info-list {
      display: grid;
      gap: 7px;
    }
    .info-row {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 12px;
    }
    .info-label {
      color: #64748b;
    }
    .table-wrap {
      margin-top: 14px;
      border: 1px solid #dbe3ef;
      border-radius: 14px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead {
      background: #eff6ff;
    }
    th,
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    th {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #334155;
      text-align: left;
    }
    tbody tr:last-child td {
      border-bottom: none;
    }
    .cell-right { text-align: right; }
    .cell-center { text-align: center; }
    .cell-code {
      font-family: "Courier New", monospace;
      font-size: 11px;
    }
    .item-name {
      font-weight: 700;
      margin-bottom: 2px;
    }
    .muted { color: #64748b; }
    .strong { font-weight: 700; }
    .footer-grid {
      display: grid;
      grid-template-columns: 0.9fr 1.1fr;
      gap: 14px;
      margin-top: 14px;
      align-items: start;
    }
    .qr-card,
    .totals-card {
      padding: 14px 16px;
    }
    .qr-card img {
      width: 150px;
      height: 150px;
      display: block;
      margin: 0 auto 10px;
    }
    .qr-link {
      font-size: 10px;
      color: #475569;
      word-break: break-all;
      line-height: 1.35;
    }
    .totals-table td {
      padding: 8px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .totals-table tr:last-child td {
      border-bottom: none;
      padding-top: 12px;
      font-size: 16px;
      font-weight: 800;
    }
    .notes {
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="document-copy">
    <div class="header">
      <section class="issuer-card">
        <div class="issuer-head">
          ${remittanceIssuerConfig.logoUrl ? `<img src="${escapeHtml(remittanceIssuerConfig.logoUrl)}" alt="Logo" class="issuer-logo" />` : ""}
          <div>
            <h1 class="issuer-title">${displayValue(organization.name, "Organización")}</h1>
            <p class="issuer-subtitle">Comprobante fiscal autorizado por ARCA</p>
          </div>
        </div>
        <div class="meta-grid">
          <div class="meta-row"><span class="meta-label">CUIT emisor</span><strong>${displayValue(organization.cuit)}</strong></div>
          <div class="meta-row"><span class="meta-label">Punto y número</span><strong>${escapeHtml(pointAndNumber)}</strong></div>
          <div class="meta-row"><span class="meta-label">CAE</span><strong>${displayValue(sale.arca_cae)}</strong></div>
          <div class="meta-row"><span class="meta-label">Vencimiento CAE</span><strong>${sale.arca_cae_expires_at ? formatDateOnly(sale.arca_cae_expires_at) : "—"}</strong></div>
          <div class="meta-row"><span class="meta-label">Dirección legal</span><strong>${displayValue(remittanceIssuerConfig.legalAddress)}</strong></div>
        </div>
      </section>

      <section class="voucher-card">
        <div class="letter-badge">${escapeHtml(getInvoiceLetter(sale.invoice_type))}</div>
        <div>
          <h2 class="voucher-title">${escapeHtml(invoiceTypeLabel)}</h2>
          <p class="voucher-type">${displayValue(sale.invoice_number, "Sin número")}</p>
        </div>
        <div class="meta-grid">
          <div class="meta-row"><span class="meta-label">Fecha de emisión</span><strong>${formatDateOnly(issueDate)}</strong></div>
          <div class="meta-row"><span class="meta-label">Fecha de venta</span><strong>${formatDateOnly(sale.sale_date)}</strong></div>
          <div class="meta-row"><span class="meta-label">Venta interna</span><strong>#${sale.sale_number ?? "—"}</strong></div>
          <div class="meta-row"><span class="meta-label">Moneda</span><strong>ARS</strong></div>
        </div>
      </section>
    </div>

    <div class="section-grid">
      <section class="section-card">
        <h3 class="section-title">Cliente</h3>
        <div class="info-list">
          <div class="info-row"><span class="info-label">Razón social</span><strong>${displayValue(sale.customer.business_name)}</strong></div>
          <div class="info-row"><span class="info-label">Fantasia</span><span>${displayValue(sale.customer.fantasy_name)}</span></div>
          <div class="info-row"><span class="info-label">Documento</span><span>${displayValue(sale.customer.cuit)}</span></div>
          <div class="info-row"><span class="info-label">Condición fiscal</span><span>${displayValue(customerTaxCondition)}</span></div>
          <div class="info-row"><span class="info-label">Dirección</span><span>${displayValue(
            [sale.customer.address, sale.customer.city]
              .filter(Boolean)
              .join(", "),
            "No informada"
          )}</span></div>
        </div>
      </section>

      <section class="section-card">
        <h3 class="section-title">Operación</h3>
        <div class="info-list">
          <div class="info-row"><span class="info-label">Vendedor</span><span>${displayValue(sale.seller?.name ?? sale.seller?.email, "No informado")}</span></div>
          <div class="info-row"><span class="info-label">Remito</span><span>${displayValue(sale.remittance_number)}</span></div>
          <div class="info-row"><span class="info-label">Observaciones</span><span>${displayValue(sale.observations, "Sin observaciones")}</span></div>
          <div class="info-row"><span class="info-label">Estado fiscal</span><strong>Autorizada</strong></div>
          <div class="info-row"><span class="info-label">Autorizada el</span><span>${sale.arca_authorized_at ? formatDateOnly(sale.arca_authorized_at) : "—"}</span></div>
        </div>
      </section>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 90px;">Código</th>
            <th>Detalle</th>
            <th style="width: 80px;" class="cell-right">Cantidad</th>
            <th style="width: 70px;" class="cell-center">Unidad</th>
            <th style="width: 90px;" class="cell-right">Peso</th>
            <th style="width: 120px;" class="cell-right">Precio U.</th>
            <th style="width: 120px;" class="cell-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${generateInvoiceItemsRows(sale)}
        </tbody>
      </table>
    </div>

    <div class="footer-grid">
      <section class="qr-card">
        <h3 class="section-title">QR fiscal</h3>
        <img src="${qrDataUrl}" alt="QR fiscal ARCA" />
        <div class="muted" style="margin-bottom: 6px;">Escaneá el código para validar el comprobante en ARCA.</div>
        <div class="qr-link">${escapeHtml(qrVerificationUrl)}</div>
      </section>

      <section class="totals-card">
        <h3 class="section-title">Totales</h3>
        <table class="totals-table">
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td class="cell-right">${formatCurrency(sale.sub_total ?? 0)}</td>
            </tr>
            ${
              sale.global_discount_amount && sale.global_discount_amount > 0
                ? `
            <tr>
              <td>Descuento global</td>
              <td class="cell-right">-${formatCurrency(sale.global_discount_amount)}</td>
            </tr>
            `
                : ""
            }
            ${generateTaxesRows(sale)}
            <tr>
              <td>Total</td>
              <td class="cell-right">${formatCurrency(sale.total_amount)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <div class="notes">
      Este comprobante fue emitido manualmente desde Rhinos usando la integración ARCA. Conservá el CAE y el QR fiscal para su validación.
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

  const html = await generateFiscalInvoiceHtml({
    sale,
    organization,
  });
  const filename = `Factura_${sanitizeFilenamePart(
    sale.invoice_number ?? String(sale.sale_number ?? sale.id)
  )}.pdf`;

  return {
    filename,
    html,
  };
}
