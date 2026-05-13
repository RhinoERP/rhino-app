import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { generateAuthorizedSaleInvoicePdf } from "@/modules/arca/server/fiscal-invoice-pdf.service";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getInvoiceTypeLabel,
  getInvoiceTypeLetter,
} from "@/modules/sales/invoice-type-utils";
import {
  getSalesOrderById,
  type SalesOrderDetail,
} from "@/modules/sales/service/sales.service";
import type { Database } from "@/types/supabase";
import { createResendClient } from "../client";
import { SaleInvoiceEmail } from "../templates/sale-invoice-email";

type SendSaleInvoiceEmailParams = {
  orgSlug: string;
  saleId: string;
  fromEmail?: string;
  fromName?: string;
};

type SaleInvoiceEmailResult =
  | { sent: true; recipient: string; resendId: string | null }
  | {
      sent: false;
      reason: "missing_customer_email" | "sale_not_authorized" | "resend_error";
      message: string;
    };

type SaleInvoiceEmailStatus =
  | "not_sent"
  | "pending"
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "bounced"
  | "complained"
  | "failed";

type SalesOrdersUpdate = Database["public"]["Tables"]["sales_orders"]["Update"];
type SupabaseDatabaseClient = SupabaseClient<Database>;

const DEFAULT_FROM_EMAIL = "empresa@rhinosapp.com";
const DEFAULT_FROM_NAME = "Rhino";

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function getCustomerDisplayName(sale: SalesOrderDetail): string {
  return (
    sale.customer.fantasy_name?.trim() ||
    sale.customer.business_name?.trim() ||
    "Cliente"
  );
}

function getInvoiceReference(sale: SalesOrderDetail): string {
  return (
    sale.invoice_number?.trim() ||
    (sale.sale_number ? `Venta ${sale.sale_number}` : `Venta ${sale.id}`)
  );
}

function ensurePageSpace(pdf: jsPDF, currentY: number, requiredHeight = 12) {
  if (currentY + requiredHeight <= 280) {
    return currentY;
  }

  pdf.addPage();
  return 20;
}

function drawLabelValueRow(params: {
  pdf: jsPDF;
  y: number;
  label: string;
  value: string;
}) {
  params.pdf.setFont("helvetica", "bold");
  params.pdf.text(params.label, 14, params.y);
  params.pdf.setFont("helvetica", "normal");
  params.pdf.text(params.value, 60, params.y);
}

function buildInvoiceAttachmentName(sale: SalesOrderDetail): string {
  return `Factura_${sanitizeFileNamePart(getInvoiceReference(sale))}.pdf`;
}

function drawInvoiceHeader(params: {
  pdf: jsPDF;
  sale: SalesOrderDetail;
  organizationName: string;
  organizationCuit: string | null | undefined;
}) {
  const { pdf, sale, organizationName, organizationCuit } = params;
  const invoiceTypeLabel = getInvoiceTypeLabel(sale.invoice_type);
  const invoiceReference = getInvoiceReference(sale);

  let y = 18;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(organizationName || "Rhino", 14, y);

  pdf.setFontSize(10);
  pdf.text(
    `${invoiceTypeLabel} ${getInvoiceTypeLetter(sale.invoice_type)}`,
    145,
    y,
    { align: "right" }
  );

  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`CUIT: ${organizationCuit?.trim() || "No informado"}`, 14, y);
  pdf.text(`Comprobante: ${invoiceReference}`, 145, y, { align: "right" });

  y += 10;
  pdf.setDrawColor(209, 213, 219);
  pdf.line(14, y, 196, y);

  return y + 9;
}

function drawInvoiceMetadata(params: {
  pdf: jsPDF;
  sale: SalesOrderDetail;
  y: number;
}) {
  const { pdf, sale } = params;
  const pointOfSaleLabel = sale.arca_point_of_sale
    ? String(sale.arca_point_of_sale).padStart(4, "0")
    : "—";
  const voucherNumberLabel = sale.arca_voucher_number
    ? String(sale.arca_voucher_number).padStart(8, "0")
    : "—";

  let y = params.y;

  drawLabelValueRow({
    pdf,
    y,
    label: "Cliente",
    value: getCustomerDisplayName(sale),
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Email",
    value: sale.customer.email?.trim() || "No informado",
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Fecha de venta",
    value: formatDateOnly(sale.sale_date),
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Fecha de autorización",
    value: sale.arca_authorized_at
      ? formatDateOnly(sale.arca_authorized_at)
      : "No informada",
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Punto de venta",
    value: pointOfSaleLabel,
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Número fiscal",
    value: voucherNumberLabel,
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "CAE",
    value: sale.arca_cae?.trim() || "No informado",
  });
  y += 7;
  drawLabelValueRow({
    pdf,
    y,
    label: "Vto. CAE",
    value: sale.arca_cae_expires_at
      ? formatDateOnly(sale.arca_cae_expires_at)
      : "No informado",
  });

  return y + 12;
}

function drawInvoiceItems(params: {
  pdf: jsPDF;
  sale: SalesOrderDetail;
  y: number;
}) {
  const { pdf, sale } = params;
  let y = params.y;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Detalle", 14, y);

  y += 7;
  pdf.setFillColor(243, 244, 246);
  pdf.rect(14, y - 5, 182, 8, "F");
  pdf.setFontSize(9);
  pdf.text("Descripcion", 16, y);
  pdf.text("Cant.", 122, y, { align: "right" });
  pdf.text("Unit.", 156, y, { align: "right" });
  pdf.text("Subtotal", 194, y, { align: "right" });

  y += 6;
  pdf.setFont("helvetica", "normal");

  for (const item of sale.items) {
    const descriptionLines = pdf.splitTextToSize(
      `${item.name}${item.description ? ` - ${item.description}` : ""}`,
      92
    );
    const blockHeight = Math.max(descriptionLines.length * 5, 6);
    y = ensurePageSpace(pdf, y, blockHeight + 6);

    pdf.text(descriptionLines, 16, y);
    pdf.text(String(item.quantity), 122, y, { align: "right" });
    pdf.text(formatCurrency(item.unitPrice), 156, y, { align: "right" });
    pdf.text(formatCurrency(item.subtotal), 194, y, { align: "right" });

    y += blockHeight;
    pdf.setDrawColor(229, 231, 235);
    pdf.line(14, y, 196, y);
    y += 4;
  }

  return y + 4;
}

function drawInvoiceTaxesAndTotals(params: {
  pdf: jsPDF;
  sale: SalesOrderDetail;
  y: number;
}) {
  const { pdf, sale } = params;
  let y = ensurePageSpace(pdf, params.y, 40);

  if ((sale.taxes?.length ?? 0) > 0) {
    pdf.setFont("helvetica", "bold");
    pdf.text("Impuestos", 14, y);
    y += 7;
    pdf.setFont("helvetica", "normal");

    for (const tax of sale.taxes) {
      y = ensurePageSpace(pdf, y, 8);
      pdf.text(`${tax.name} (${tax.rate}%)`, 16, y);
      pdf.text(formatCurrency(tax.taxAmount), 194, y, { align: "right" });
      y += 6;
    }

    y += 4;
  }

  pdf.setFont("helvetica", "bold");
  pdf.text("Subtotal", 140, y);
  pdf.text(formatCurrency(sale.sub_total ?? 0), 194, y, { align: "right" });
  y += 7;

  if (sale.global_discount_amount && sale.global_discount_amount > 0) {
    pdf.text("Descuento global", 140, y);
    pdf.text(formatCurrency(sale.global_discount_amount), 194, y, {
      align: "right",
    });
    y += 7;
  }

  pdf.text("Total", 140, y);
  pdf.text(formatCurrency(sale.total_amount), 194, y, { align: "right" });

  return y + 14;
}

function drawInvoiceFooter(params: { pdf: jsPDF; y: number }) {
  const y = ensurePageSpace(params.pdf, params.y, 20);

  params.pdf.setFont("helvetica", "normal");
  params.pdf.setFontSize(8);
  params.pdf.setTextColor(75, 85, 99);
  params.pdf.text(
    "Comprobante electrónico generado automáticamente por Rhino.",
    14,
    y
  );
}

function buildSaleInvoicePdfAttachment(params: {
  sale: SalesOrderDetail;
  organizationName: string;
  organizationCuit: string | null | undefined;
}): { filename: string; content: Buffer } {
  const { sale, organizationName, organizationCuit } = params;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const filename = buildInvoiceAttachmentName(sale);
  let y = drawInvoiceHeader({
    pdf,
    sale,
    organizationName,
    organizationCuit,
  });
  y = drawInvoiceMetadata({ pdf, sale, y });
  y = drawInvoiceItems({ pdf, sale, y });
  y = drawInvoiceTaxesAndTotals({ pdf, sale, y });

  pdf.setFont("helvetica", "normal");
  drawInvoiceFooter({ pdf, y });

  const content = Buffer.from(pdf.output("arraybuffer"));

  return { filename, content };
}

async function updateSaleInvoiceEmailState(
  saleId: string,
  patch: SalesOrdersUpdate
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_orders")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId);

  if (error) {
    throw new Error(
      `No se pudo guardar el estado del email de factura: ${error.message}`
    );
  }
}

async function markInvoiceEmailPending(params: {
  saleId: string;
  recipient: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await updateSaleInvoiceEmailState(params.saleId, {
    invoice_email_status: "pending",
    invoice_email_recipient: params.recipient,
    invoice_email_resend_id: null,
    invoice_email_sent_at: null,
    invoice_email_delivered_at: null,
    invoice_email_last_attempt_at: now,
    invoice_email_last_event: null,
    invoice_email_last_event_at: null,
    invoice_email_last_error: null,
  });
}

async function markInvoiceEmailFailed(params: {
  saleId: string;
  recipient?: string | null;
  message: string;
}): Promise<void> {
  await updateSaleInvoiceEmailState(params.saleId, {
    invoice_email_status: "failed",
    invoice_email_recipient: params.recipient ?? null,
    invoice_email_last_attempt_at: new Date().toISOString(),
    invoice_email_last_error: params.message,
  });
}

async function markInvoiceEmailSent(params: {
  saleId: string;
  recipient: string;
  resendId: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await updateSaleInvoiceEmailState(params.saleId, {
    invoice_email_status: "sent",
    invoice_email_recipient: params.recipient,
    invoice_email_resend_id: params.resendId,
    invoice_email_sent_at: now,
    invoice_email_last_attempt_at: now,
    invoice_email_last_error: null,
    invoice_email_last_event: "email.sent",
    invoice_email_last_event_at: now,
  });
}

async function buildSaleInvoiceEmailAttachment(params: {
  orgSlug: string;
  saleId: string;
  sale: SalesOrderDetail;
  organizationName: string;
  organizationCuit: string | null | undefined;
}): Promise<{ filename: string; content: Buffer }> {
  const printableInvoice = await generateAuthorizedSaleInvoicePdf({
    orgSlug: params.orgSlug,
    saleId: params.saleId,
  });
  const attachment = buildSaleInvoicePdfAttachment({
    sale: params.sale,
    organizationName: params.organizationName,
    organizationCuit: params.organizationCuit,
  });

  return {
    ...attachment,
    filename: printableInvoice.filename,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

export async function sendSaleInvoiceEmail(
  params: SendSaleInvoiceEmailParams
): Promise<SaleInvoiceEmailResult> {
  const [sale, organization, orgSettings] = await Promise.all([
    getSalesOrderById(params.orgSlug, params.saleId),
    getOrganizationBySlug(params.orgSlug),
    getOrgSettings(params.orgSlug),
  ]);

  if (!(sale && organization)) {
    throw new Error("No se pudo preparar el email de factura.");
  }

  if (sale.arca_status !== "authorized") {
    await markInvoiceEmailFailed({
      saleId: sale.id,
      recipient: sale.customer.email?.trim() || null,
      message: "La venta todavía no tiene una factura fiscal autorizada.",
    });

    return {
      sent: false,
      reason: "sale_not_authorized",
      message: "La venta todavía no tiene una factura fiscal autorizada.",
    };
  }

  const recipient = sale.customer.email?.trim();

  if (!recipient) {
    const message = "El cliente no tiene email cargado.";
    await markInvoiceEmailFailed({
      saleId: sale.id,
      recipient: null,
      message,
    });

    return {
      sent: false,
      reason: "missing_customer_email",
      message,
    };
  }

  await markInvoiceEmailPending({ saleId: sale.id, recipient });

  try {
    const resend = createResendClient();
    const customerName = getCustomerDisplayName(sale);
    const invoiceReference = getInvoiceReference(sale);
    const attachment = await buildSaleInvoiceEmailAttachment({
      orgSlug: params.orgSlug,
      saleId: params.saleId,
      sale,
      organizationName: organization.name,
      organizationCuit: organization.cuit,
    });
    const fromEmail =
      params.fromEmail ||
      process.env.RESEND_INVOICE_FROM_EMAIL ||
      process.env.RESEND_FROM_EMAIL ||
      DEFAULT_FROM_EMAIL;
    const fromName =
      params.fromName ||
      orgSettings.invoice_email_from_name ||
      process.env.RESEND_INVOICE_FROM_NAME ||
      process.env.RESEND_FROM_NAME ||
      organization.name ||
      DEFAULT_FROM_NAME;

    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: recipient,
      subject: `Acá está tu factura electrónica ${invoiceReference}`,
      react: SaleInvoiceEmail({
        customerName,
        organizationName: organization.name,
        invoiceNumber: invoiceReference,
      }),
      attachments: [
        {
          filename: attachment.filename,
          content: attachment.content,
          contentType: "application/pdf",
        },
      ],
    });

    if (error) {
      const message = `Error enviando factura por email: ${error.message}`;
      await markInvoiceEmailFailed({
        saleId: sale.id,
        recipient,
        message,
      });

      return {
        sent: false,
        reason: "resend_error",
        message,
      };
    }

    const resendId = data?.id ?? null;
    await markInvoiceEmailSent({
      saleId: sale.id,
      recipient,
      resendId,
    });

    return {
      sent: true,
      recipient,
      resendId,
    };
  } catch (error) {
    const message = `Error enviando factura por email: ${getErrorMessage(error)}`;
    await markInvoiceEmailFailed({
      saleId: sale.id,
      recipient,
      message,
    });

    return {
      sent: false,
      reason: "resend_error",
      message,
    };
  }
}

type ResendWebhookPayload = {
  type?: string;
  created_at?: string;
  data?: {
    id?: string;
    email_id?: string;
    to?: string | string[];
    recipient?: string;
    error?: string | { message?: string };
    reason?: string;
    message?: string;
  };
};

const RESEND_EVENT_STATUS: Record<string, SaleInvoiceEmailStatus | undefined> =
  {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delivery_delayed",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.failed": "failed",
  };

function asWebhookPayload(value: unknown): ResendWebhookPayload {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as ResendWebhookPayload;
}

function getWebhookEmailId(payload: ResendWebhookPayload): string | null {
  const id = payload.data?.email_id ?? payload.data?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function getWebhookTimestamp(payload: ResendWebhookPayload): string {
  return payload.created_at || new Date().toISOString();
}

function getWebhookErrorMessage(payload: ResendWebhookPayload): string | null {
  const error = payload.data?.error;

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object" && error.message?.trim()) {
    return error.message.trim();
  }

  return payload.data?.reason ?? payload.data?.message ?? null;
}

function getWebhookRecipient(payload: ResendWebhookPayload): string | null {
  const recipient = payload.data?.recipient ?? payload.data?.to;

  if (typeof recipient === "string") {
    return recipient;
  }

  if (Array.isArray(recipient)) {
    return recipient[0] ?? null;
  }

  return null;
}

async function updateSaleInvoiceEmailStateByResendId(params: {
  supabase: SupabaseDatabaseClient;
  resendId: string;
  patch: SalesOrdersUpdate;
}): Promise<void> {
  const { error } = await params.supabase
    .from("sales_orders")
    .update({
      ...params.patch,
      updated_at: new Date().toISOString(),
    })
    .eq("invoice_email_resend_id", params.resendId);

  if (error) {
    throw new Error(
      `No se pudo actualizar el estado del webhook de Resend: ${error.message}`
    );
  }
}

export async function handleSaleInvoiceEmailWebhook(
  rawPayload: unknown
): Promise<{ handled: boolean; resendId?: string; status?: string }> {
  const payload = asWebhookPayload(rawPayload);
  const eventType = payload.type;
  const status = eventType ? RESEND_EVENT_STATUS[eventType] : undefined;
  const resendId = getWebhookEmailId(payload);

  if (!(eventType && status && resendId)) {
    return { handled: false };
  }

  const eventAt = getWebhookTimestamp(payload);
  const patch: SalesOrdersUpdate = {
    invoice_email_status: status,
    invoice_email_last_event: eventType,
    invoice_email_last_event_at: eventAt,
  };

  if (status === "sent" && !patch.invoice_email_sent_at) {
    patch.invoice_email_sent_at = eventAt;
  }

  if (status === "delivered") {
    patch.invoice_email_delivered_at = eventAt;
    patch.invoice_email_last_error = null;
  }

  if (
    status === "failed" ||
    status === "bounced" ||
    status === "complained" ||
    status === "delivery_delayed"
  ) {
    patch.invoice_email_last_error =
      getWebhookErrorMessage(payload) ??
      `Resend informó el evento ${eventType} para este email.`;
  }

  const recipient = getWebhookRecipient(payload);
  if (recipient) {
    patch.invoice_email_recipient = recipient;
  }

  await updateSaleInvoiceEmailStateByResendId({
    supabase: createAdminClient() as SupabaseDatabaseClient,
    resendId,
    patch,
  });

  return { handled: true, resendId, status };
}
