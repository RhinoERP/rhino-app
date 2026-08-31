import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { generateAuthorizedSaleInvoicePdfDocument } from "@/modules/arca/server/fiscal-invoice-pdf.service";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getSalesOrderById,
  type SalesOrderDetail,
} from "@/modules/sales/service/sales.service";
import type { Database } from "@/types/supabase";
import { createResendClient } from "../client";
import { SaleInvoiceEmail } from "../templates/sale-invoice-email";
import { updateCreditNoteEmailStateByResendId } from "./send-credit-note-email";

type SendSaleInvoiceEmailParams = {
  orgSlug: string;
  saleId: string;
  fromEmail?: string;
  fromName?: string;
  recipients?: string[];
  subject?: string;
  bodyText?: string;
  attachPdf?: boolean;
};

type SaleInvoiceEmailResult =
  | {
      sent: true;
      recipient: string;
      recipients: string[];
      resendId: string | null;
    }
  | {
      sent: false;
      reason:
        | "missing_customer_email"
        | "invalid_recipient_email"
        | "sale_not_authorized"
        | "resend_error";
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
type InvoiceEmailOrgSettings = Awaited<ReturnType<typeof getOrgSettings>>;

const DEFAULT_FROM_EMAIL = "empresa@rhinosapp.com";
const DEFAULT_FROM_NAME = "Rhino";
const DEFAULT_INVOICE_EMAIL_SUBJECT_TEMPLATE =
  "Factura electrónica {comprobante}";
const DEFAULT_INVOICE_EMAIL_BODY_TEMPLATE = `Hola {cliente},

Te enviamos la factura electrónica {comprobante}, emitida por {organizacion}, correspondiente a la venta del {fecha} por {total}.

Saludos`;
const EMAIL_SEPARATOR_REGEX = /[\s,;]+/u;
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function normalizeInvoiceEmailRecipients(
  value: string | string[] | null | undefined
): { recipients: string[]; invalidRecipients: string[] } {
  const values = Array.isArray(value) ? value : [value];
  const recipients: string[] = [];
  const invalidRecipients: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of values) {
    if (!rawValue) {
      continue;
    }

    for (const rawRecipient of rawValue.split(EMAIL_SEPARATOR_REGEX)) {
      const recipient = rawRecipient.trim();

      if (!recipient) {
        continue;
      }

      if (!SIMPLE_EMAIL_REGEX.test(recipient)) {
        invalidRecipients.push(recipient);
        continue;
      }

      const key = recipient.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      recipients.push(recipient);
    }
  }

  return { recipients, invalidRecipients };
}

function formatInvoiceEmailRecipientList(recipients: string[]): string {
  return recipients.join(", ");
}

function getDefaultInvoiceEmailRecipientSource(
  sale: SalesOrderDetail
): string | null {
  return (
    sale.invoice_email_recipient?.trim() || sale.customer.email?.trim() || null
  );
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

function buildInvoiceEmailTemplateValues(params: {
  sale: SalesOrderDetail;
  organizationName: string;
}) {
  const invoiceReference = getInvoiceReference(params.sale);

  return {
    cliente: getCustomerDisplayName(params.sale),
    organizacion: params.organizationName || DEFAULT_FROM_NAME,
    comprobante: invoiceReference,
    numero_factura: invoiceReference,
    fecha: formatDateOnly(params.sale.sale_date),
    total: formatCurrency(
      params.sale.total_amount,
      params.sale.currency === "USD" ? "USD" : "ARS"
    ),
  };
}

function renderInvoiceEmailTemplate(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(
    /\{([a-zA-Z_]+)\}/g,
    (match, key: string) => values[key] ?? match
  );
}

function resolveSaleInvoiceEmailRecipients(params: {
  sale: SalesOrderDetail;
  recipients?: string[];
}):
  | { ok: true; recipient: string; recipients: string[] }
  | {
      ok: false;
      reason: "missing_customer_email" | "invalid_recipient_email";
      recipient: string | null;
      message: string;
    } {
  const { recipients, invalidRecipients } = normalizeInvoiceEmailRecipients(
    params.recipients?.length
      ? params.recipients
      : getDefaultInvoiceEmailRecipientSource(params.sale)
  );
  const recipient = formatInvoiceEmailRecipientList(recipients);

  if (invalidRecipients.length > 0) {
    return {
      ok: false,
      reason: "invalid_recipient_email",
      recipient:
        recipient || getDefaultInvoiceEmailRecipientSource(params.sale),
      message: `Hay emails inválidos: ${invalidRecipients.join(", ")}.`,
    };
  }

  if (recipients.length === 0) {
    return {
      ok: false,
      reason: "missing_customer_email",
      recipient: null,
      message: "No hay destinatarios de email cargados.",
    };
  }

  return { ok: true, recipient, recipients };
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
}): Promise<{ filename: string; content: Buffer }> {
  const printableInvoice = await generateAuthorizedSaleInvoicePdfDocument({
    orgSlug: params.orgSlug,
    saleId: params.saleId,
  });

  return {
    filename: printableInvoice.filename,
    content: printableInvoice.content,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

async function buildSaleInvoiceEmailMessage(params: {
  orgSlug: string;
  saleId: string;
  sale: SalesOrderDetail;
  organizationName: string;
  orgSettings: InvoiceEmailOrgSettings;
  subject?: string;
  bodyText?: string;
  attachPdf?: boolean;
}): Promise<{
  subject: string;
  bodyText: string;
  invoiceReference: string;
  attachment: { filename: string; content: Buffer } | null;
}> {
  const templateValues = buildInvoiceEmailTemplateValues({
    sale: params.sale,
    organizationName: params.organizationName,
  });
  const subject =
    params.subject?.trim() ||
    renderInvoiceEmailTemplate(
      params.orgSettings.invoice_email_subject_template ||
        DEFAULT_INVOICE_EMAIL_SUBJECT_TEMPLATE,
      templateValues
    );
  const bodyText =
    params.bodyText?.trim() ||
    renderInvoiceEmailTemplate(
      params.orgSettings.invoice_email_body_template ||
        DEFAULT_INVOICE_EMAIL_BODY_TEMPLATE,
      templateValues
    );
  const attachment =
    (params.attachPdf ?? params.orgSettings.invoice_email_attach_pdf)
      ? await buildSaleInvoiceEmailAttachment({
          orgSlug: params.orgSlug,
          saleId: params.saleId,
        })
      : null;

  return {
    subject,
    bodyText,
    invoiceReference: templateValues.comprobante,
    attachment,
  };
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
      recipient: getDefaultInvoiceEmailRecipientSource(sale),
      message: "La venta todavía no tiene una factura fiscal autorizada.",
    });

    return {
      sent: false,
      reason: "sale_not_authorized",
      message: "La venta todavía no tiene una factura fiscal autorizada.",
    };
  }

  const recipientResolution = resolveSaleInvoiceEmailRecipients({
    sale,
    recipients: params.recipients,
  });

  if (!recipientResolution.ok) {
    await markInvoiceEmailFailed({
      saleId: sale.id,
      recipient: recipientResolution.recipient,
      message: recipientResolution.message,
    });

    return {
      sent: false,
      reason: recipientResolution.reason,
      message: recipientResolution.message,
    };
  }

  const { recipient, recipients } = recipientResolution;

  await markInvoiceEmailPending({ saleId: sale.id, recipient });

  try {
    const resend = createResendClient();
    const emailMessage = await buildSaleInvoiceEmailMessage({
      orgSlug: params.orgSlug,
      saleId: params.saleId,
      sale,
      organizationName: organization.name,
      orgSettings,
      subject: params.subject,
      bodyText: params.bodyText,
      attachPdf: params.attachPdf,
    });
    const fromEmail =
      params.fromEmail ||
      process.env.RESEND_INVOICE_FROM_EMAIL ||
      process.env.RESEND_FROM_EMAIL ||
      DEFAULT_FROM_EMAIL;
    const fromName =
      params.fromName?.trim() ||
      orgSettings.invoice_email_from_name ||
      process.env.RESEND_INVOICE_FROM_NAME ||
      process.env.RESEND_FROM_NAME ||
      organization.name ||
      DEFAULT_FROM_NAME;

    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: recipients,
      subject: emailMessage.subject,
      react: SaleInvoiceEmail({
        bodyText: emailMessage.bodyText,
        invoiceNumber: emailMessage.invoiceReference,
        previewText: emailMessage.subject,
      }),
      ...(emailMessage.attachment
        ? {
            attachments: [
              {
                filename: emailMessage.attachment.filename,
                content: emailMessage.attachment.content,
                contentType: "application/pdf",
              },
            ],
          }
        : {}),
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
      recipients,
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

export async function updateSaleInvoiceEmailRecipients(params: {
  orgSlug: string;
  saleId: string;
  recipients: string[];
}): Promise<{ recipient: string; recipients: string[] }> {
  const sale = await getSalesOrderById(params.orgSlug, params.saleId);

  if (!sale) {
    throw new Error("No se pudo actualizar el email de factura.");
  }

  const { recipients, invalidRecipients } = normalizeInvoiceEmailRecipients(
    params.recipients
  );

  if (invalidRecipients.length > 0) {
    throw new Error(`Hay emails inválidos: ${invalidRecipients.join(", ")}.`);
  }

  if (recipients.length === 0) {
    throw new Error("Cargá al menos un destinatario de email.");
  }

  const recipient = formatInvoiceEmailRecipientList(recipients);
  const currentRecipient = formatInvoiceEmailRecipientList(
    normalizeInvoiceEmailRecipients(getDefaultInvoiceEmailRecipientSource(sale))
      .recipients
  );
  const hasRecipientChanged =
    recipient.toLowerCase() !== currentRecipient.toLowerCase();

  await updateSaleInvoiceEmailState(sale.id, {
    invoice_email_recipient: recipient,
    ...(hasRecipientChanged
      ? {
          invoice_email_status: "not_sent",
          invoice_email_resend_id: null,
          invoice_email_sent_at: null,
          invoice_email_delivered_at: null,
          invoice_email_last_attempt_at: null,
          invoice_email_last_event: null,
          invoice_email_last_event_at: null,
          invoice_email_last_error: null,
        }
      : {}),
  });

  return { recipient, recipients };
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
    return recipient.trim() || null;
  }

  if (Array.isArray(recipient)) {
    const recipients = recipient
      .map((item) => item.trim())
      .filter((item) => Boolean(item));

    return recipients.length > 0 ? recipients.join(", ") : null;
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

  const supabase = createAdminClient() as SupabaseDatabaseClient;

  await updateSaleInvoiceEmailStateByResendId({
    supabase,
    resendId,
    patch,
  });
  await updateCreditNoteEmailStateByResendId({
    supabase,
    resendId,
    patch,
  });

  return { handled: true, resendId, status };
}
