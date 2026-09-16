import "server-only";

import QRCode from "qrcode";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { getCustomerTaxConditionLabel } from "@/modules/customers/tax-conditions";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getInvoiceTypeLabel,
  getInvoiceTypeLetter,
} from "@/modules/sales/invoice-type-utils";
import type { Json } from "@/types/supabase";
import { buildArcaQrPayload, buildArcaQrVerifierUrl } from "../arca-qr";
import { ArcaValidationError } from "../errors";
import { readAuthorizedFiscalCurrency } from "../fiscal-currency";
import { renderHtmlToPdfBuffer } from "./html-to-pdf.service";
import {
  getManualFiscalInvoiceById,
  type ManualFiscalInvoice,
} from "./manual-fiscal-invoices.service";
import { getOrganizationArcaSettingsByOrganizationId } from "./repository";

type PrintableManualFiscalInvoice = {
  filename: string;
  html: string;
};

type PrintableManualFiscalInvoiceDocument = PrintableManualFiscalInvoice & {
  content: Buffer;
};

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

function displayValue(value: string | null | undefined): string {
  return escapeHtml(value?.trim() || "—");
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readReceiverDocument(invoice: ManualFiscalInvoice): {
  type: number | null;
  number: number | null;
} {
  const request = asRecord(asRecord(invoice.arca_request_json)?.wsfeRequest);
  return {
    type: typeof request?.DocTipo === "number" ? request.DocTipo : null,
    number: typeof request?.DocNro === "number" ? request.DocNro : null,
  };
}

async function buildFiscalQrDataUrl(params: {
  invoice: ManualFiscalInvoice;
  organizationCuit: string | null | undefined;
}): Promise<string> {
  const { invoice, organizationCuit } = params;
  if (
    !(
      invoice.arca_point_of_sale &&
      invoice.arca_voucher_number &&
      invoice.arca_voucher_type_code &&
      invoice.arca_cae
    )
  ) {
    throw new ArcaValidationError(
      "La factura manual no tiene datos fiscales suficientes para generar el QR."
    );
  }

  const issuerCuit = Number((organizationCuit ?? "").replace(/\D/g, ""));
  if (!Number.isFinite(issuerCuit) || issuerCuit <= 0) {
    throw new ArcaValidationError(
      "La organización no tiene un CUIT válido para generar el QR fiscal."
    );
  }

  const fiscalCurrency = readAuthorizedFiscalCurrency(
    invoice.arca_request_json as Json
  );
  const receiver = readReceiverDocument(invoice);
  const verificationUrl = buildArcaQrVerifierUrl(
    buildArcaQrPayload({
      issueDate: invoice.issue_date,
      issuerCuit,
      pointOfSale: invoice.arca_point_of_sale,
      voucherTypeCode: invoice.arca_voucher_type_code,
      voucherNumber: invoice.arca_voucher_number,
      totalAmount: invoice.total_amount,
      currency: fiscalCurrency.code,
      currencyRate: fiscalCurrency.rate,
      receiverDocumentType: receiver.type,
      receiverDocumentNumber: receiver.number,
      authorizationCode: invoice.arca_cae,
    })
  );

  return await QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 180,
  });
}

async function generateManualFiscalInvoiceHtml(params: {
  invoice: ManualFiscalInvoice;
  organization: Awaited<ReturnType<typeof getOrganizationBySlug>>;
  branding: {
    issuerBusinessName: string | null;
    issuerLegalAddress: string | null;
    issuerLogoUrl: string | null;
  };
}): Promise<string> {
  const { invoice, organization, branding } = params;
  if (!(organization && invoice.status === "authorized")) {
    throw new ArcaValidationError(
      "La factura manual todavía no está autorizada para imprimir."
    );
  }

  const qrDataUrl = await buildFiscalQrDataUrl({
    invoice,
    organizationCuit: organization.cuit,
  });
  const customer = invoice.customer;
  const customerName =
    customer?.fantasy_name?.trim() ||
    customer?.business_name?.trim() ||
    "Cliente";
  const pointAndNumber =
    invoice.invoice_number ??
    `${String(invoice.arca_point_of_sale).padStart(4, "0")}-${String(
      invoice.arca_voucher_number
    ).padStart(8, "0")}`;
  const currency = invoice.currency;
  const items = invoice.items ?? [];
  const customerTaxCondition =
    getCustomerTaxConditionLabel(customer?.tax_condition) ??
    customer?.tax_condition ??
    "No informada";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { color: #111827; font-family: Arial, sans-serif; font-size: 11px; line-height: 1.4; }
    .header { display: grid; grid-template-columns: 1fr 58px 1fr; gap: 14px; border-bottom: 2px solid #111827; padding-bottom: 14px; }
    .logo { max-height: 45px; max-width: 150px; object-fit: contain; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 18px; } h2 { font-size: 16px; }
    .muted { color: #4b5563; } .letter { border: 2px solid #111827; font-size: 28px; font-weight: bold; height: 54px; text-align: center; padding-top: 5px; }
    .right { text-align: right; } .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 18px; margin-top: 16px; }
    .box { border: 1px solid #d1d5db; padding: 10px; } .label { color: #6b7280; display: block; font-size: 9px; text-transform: uppercase; }
    table { border-collapse: collapse; margin-top: 18px; width: 100%; } th, td { border: 1px solid #d1d5db; padding: 7px; } th { background: #f3f4f6; text-align: left; } .number { text-align: right; }
    .footer { display: grid; grid-template-columns: 1fr 180px; gap: 20px; margin-top: 18px; } .totals td { border: 0; padding: 4px; } .totals tr:last-child td { border-top: 1px solid #111827; font-size: 13px; font-weight: bold; }
    .message { margin-top: 18px; white-space: pre-wrap; } .qr { text-align: right; } .qr img { width: 120px; }
  </style>
</head>
<body>
  <header class="header">
    <section>
      ${branding.issuerLogoUrl ? `<img class="logo" src="${escapeHtml(branding.issuerLogoUrl)}" alt="Logo" />` : ""}
      <h1>${displayValue(branding.issuerBusinessName || organization.name)}</h1>
      <p class="muted">CUIT: ${displayValue(organization.cuit)}</p>
      <p class="muted">${displayValue(branding.issuerLegalAddress)}</p>
    </section>
    <div class="letter">${escapeHtml(getInvoiceTypeLetter(invoice.invoice_type))}</div>
    <section class="right">
      <h2>${escapeHtml(getInvoiceTypeLabel(invoice.invoice_type))}</h2>
      <p>Nº ${escapeHtml(pointAndNumber)}</p>
      <p class="muted">Autorizada por ARCA</p>
    </section>
  </header>
  <section class="grid">
    <div class="box"><span class="label">Cliente</span>${escapeHtml(customerName)}</div>
    <div class="box"><span class="label">CUIT / Documento</span>${displayValue(customer?.cuit)}</div>
    <div class="box"><span class="label">Condición frente al IVA</span>${displayValue(customerTaxCondition)}</div>
    <div class="box"><span class="label">Fecha de emisión</span>${formatDateOnly(invoice.issue_date)}</div>
  </section>
  <table>
    <thead><tr><th>Descripción</th><th class="number">Cant.</th><th class="number">Precio unit.</th><th class="number">IVA</th><th class="number">Importe</th></tr></thead>
    <tbody>${items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.description)}</td><td class="number">${item.quantity}</td><td class="number">${formatCurrency(item.unit_price, currency)}</td><td class="number">${item.iva_rate}%</td><td class="number">${formatCurrency(item.total_amount, currency)}</td></tr>`
      )
      .join("")}</tbody>
  </table>
  <section class="footer">
    <div>
      <div class="box"><span class="label">CAE</span>${displayValue(invoice.arca_cae)} · vence ${invoice.arca_cae_expires_at ? formatDateOnly(invoice.arca_cae_expires_at) : "—"}</div>
      ${invoice.custom_message ? `<div class="box message"><span class="label">Observaciones</span>${escapeHtml(invoice.custom_message)}</div>` : ""}
    </div>
    <div class="qr"><img src="${qrDataUrl}" alt="QR fiscal" /><table class="totals"><tbody><tr><td>Neto</td><td class="number">${formatCurrency(invoice.sub_total, currency)}</td></tr><tr><td>IVA</td><td class="number">${formatCurrency(invoice.total_tax_amount, currency)}</td></tr><tr><td>Total</td><td class="number">${formatCurrency(invoice.total_amount, currency)}</td></tr></tbody></table></div>
  </section>
</body>
</html>`;
}

export async function generateAuthorizedManualFiscalInvoicePdf(params: {
  orgSlug: string;
  invoiceId: string;
}): Promise<PrintableManualFiscalInvoice> {
  const [invoice, organization] = await Promise.all([
    getManualFiscalInvoiceById(params),
    getOrganizationBySlug(params.orgSlug),
  ]);
  if (!organization) {
    throw new ArcaValidationError("Organización no encontrada.");
  }

  const settings = await getOrganizationArcaSettingsByOrganizationId(
    organization.id
  );
  const html = await generateManualFiscalInvoiceHtml({
    invoice,
    organization,
    branding: {
      issuerBusinessName: settings?.issuer_business_name ?? null,
      issuerLegalAddress: settings?.issuer_legal_address ?? null,
      issuerLogoUrl: settings?.issuer_logo_data_url ?? null,
    },
  });

  return {
    filename: `Factura_${sanitizeFilenamePart(invoice.invoice_number ?? invoice.id)}.pdf`,
    html,
  };
}

export async function generateAuthorizedManualFiscalInvoicePdfDocument(params: {
  orgSlug: string;
  invoiceId: string;
}): Promise<PrintableManualFiscalInvoiceDocument> {
  const printable = await generateAuthorizedManualFiscalInvoicePdf(params);
  return { ...printable, content: await renderHtmlToPdfBuffer(printable.html) };
}
