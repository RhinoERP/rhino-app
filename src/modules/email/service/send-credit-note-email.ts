import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { generateCreditNotePdfDocument } from "@/modules/credit-notes/service/credit-note-pdf-document.service";
import { getCreditNoteById } from "@/modules/credit-notes/service/credit-notes.service";
import type { CreditNote } from "@/modules/credit-notes/types";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import { createResendClient } from "../client";
import { CreditNoteEmail } from "../templates/credit-note-email";

type SendCreditNoteEmailParams = {
  orgSlug: string;
  creditNoteId: string;
  fromEmail?: string;
  fromName?: string;
  recipients?: string[];
  subject?: string;
  bodyText?: string;
  attachPdf?: boolean;
};

type CreditNoteEmailResult =
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
        | "credit_note_not_authorized"
        | "resend_error";
      message: string;
    };

type CreditNotesUpdate = Database["public"]["Tables"]["credit_notes"]["Update"];
type SupabaseDatabaseClient = SupabaseClient<Database>;
type InvoiceEmailOrgSettings = Awaited<ReturnType<typeof getOrgSettings>>;
type CreditNoteEmailWebhookPatch = Partial<
  Pick<
    CreditNotesUpdate,
    | "invoice_email_status"
    | "invoice_email_recipient"
    | "invoice_email_sent_at"
    | "invoice_email_delivered_at"
    | "invoice_email_last_event"
    | "invoice_email_last_event_at"
    | "invoice_email_last_error"
  >
>;

const DEFAULT_FROM_EMAIL = "empresa@rhinosapp.com";
const DEFAULT_FROM_NAME = "Rhino";
const DEFAULT_CREDIT_NOTE_EMAIL_SUBJECT_TEMPLATE =
  "Nota de crédito electrónica {comprobante}";
const DEFAULT_CREDIT_NOTE_EMAIL_BODY_TEMPLATE = `Hola {cliente},

Te enviamos la nota de crédito electrónica {comprobante}, emitida por {organizacion}, correspondiente al {fecha} por {total}.

Saludos`;
const EMAIL_SEPARATOR_REGEX = /[\s,;]+/u;
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function normalizeEmailRecipients(
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

function formatEmailRecipientList(recipients: string[]): string {
  return recipients.join(", ");
}

function getDefaultCreditNoteEmailRecipientSource(
  creditNote: CreditNote
): string | null {
  return (
    creditNote.invoiceEmailRecipient?.trim() ||
    creditNote.customer?.email?.trim() ||
    null
  );
}

function getCustomerDisplayName(creditNote: CreditNote): string {
  return (
    creditNote.customer?.fantasyName?.trim() ||
    creditNote.customer?.businessName?.trim() ||
    "Cliente"
  );
}

function formatArcaNumber(
  pointOfSale: number | null,
  voucherNumber: number | null
): string | null {
  if (!(pointOfSale && voucherNumber)) {
    return null;
  }

  return `${String(pointOfSale).padStart(4, "0")}-${String(voucherNumber).padStart(8, "0")}`;
}

function getCreditNoteReference(creditNote: CreditNote): string {
  return (
    formatArcaNumber(
      creditNote.arcaPointOfSale,
      creditNote.arcaVoucherNumber
    ) ||
    creditNote.creditNoteNumber ||
    creditNote.id
  );
}

function buildCreditNoteEmailTemplateValues(params: {
  creditNote: CreditNote;
  organizationName: string;
}) {
  const creditNoteReference = getCreditNoteReference(params.creditNote);

  return {
    cliente: getCustomerDisplayName(params.creditNote),
    organizacion: params.organizationName || DEFAULT_FROM_NAME,
    comprobante: creditNoteReference,
    numero_nota_credito: creditNoteReference,
    fecha: formatDateOnly(params.creditNote.issueDate),
    total: formatCurrency(params.creditNote.amount),
  };
}

function renderEmailTemplate(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(
    /\{([a-zA-Z_]+)\}/g,
    (match, key: string) => values[key] ?? match
  );
}

function resolveCreditNoteEmailRecipients(params: {
  creditNote: CreditNote;
  recipients?: string[];
}):
  | { ok: true; recipient: string; recipients: string[] }
  | {
      ok: false;
      reason: "missing_customer_email" | "invalid_recipient_email";
      recipient: string | null;
      message: string;
    } {
  const { recipients, invalidRecipients } = normalizeEmailRecipients(
    params.recipients?.length
      ? params.recipients
      : getDefaultCreditNoteEmailRecipientSource(params.creditNote)
  );
  const recipient = formatEmailRecipientList(recipients);

  if (invalidRecipients.length > 0) {
    return {
      ok: false,
      reason: "invalid_recipient_email",
      recipient:
        recipient ||
        getDefaultCreditNoteEmailRecipientSource(params.creditNote),
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

async function updateCreditNoteEmailState(
  creditNoteId: string,
  patch: CreditNotesUpdate
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("credit_notes")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", creditNoteId);

  if (error) {
    throw new Error(
      `No se pudo guardar el estado del email de nota de crédito: ${error.message}`
    );
  }
}

async function markCreditNoteEmailPending(params: {
  creditNoteId: string;
  recipient: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await updateCreditNoteEmailState(params.creditNoteId, {
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

async function markCreditNoteEmailFailed(params: {
  creditNoteId: string;
  recipient?: string | null;
  message: string;
}): Promise<void> {
  await updateCreditNoteEmailState(params.creditNoteId, {
    invoice_email_status: "failed",
    invoice_email_recipient: params.recipient ?? null,
    invoice_email_last_attempt_at: new Date().toISOString(),
    invoice_email_last_error: params.message,
  });
}

async function markCreditNoteEmailSent(params: {
  creditNoteId: string;
  recipient: string;
  resendId: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await updateCreditNoteEmailState(params.creditNoteId, {
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

async function buildCreditNoteEmailAttachment(params: {
  orgSlug: string;
  creditNoteId: string;
}): Promise<{ filename: string; content: Buffer }> {
  const printableCreditNote = await generateCreditNotePdfDocument(params);

  return {
    filename: printableCreditNote.filename,
    content: printableCreditNote.content,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

async function buildCreditNoteEmailMessage(params: {
  orgSlug: string;
  creditNoteId: string;
  creditNote: CreditNote;
  organizationName: string;
  orgSettings: InvoiceEmailOrgSettings;
  subject?: string;
  bodyText?: string;
  attachPdf?: boolean;
}): Promise<{
  subject: string;
  bodyText: string;
  creditNoteReference: string;
  attachment: { filename: string; content: Buffer } | null;
}> {
  const templateValues = buildCreditNoteEmailTemplateValues({
    creditNote: params.creditNote,
    organizationName: params.organizationName,
  });
  const subject =
    params.subject?.trim() ||
    renderEmailTemplate(
      DEFAULT_CREDIT_NOTE_EMAIL_SUBJECT_TEMPLATE,
      templateValues
    );
  const bodyText =
    params.bodyText?.trim() ||
    renderEmailTemplate(
      DEFAULT_CREDIT_NOTE_EMAIL_BODY_TEMPLATE,
      templateValues
    );
  const attachment =
    (params.attachPdf ?? params.orgSettings.invoice_email_attach_pdf)
      ? await buildCreditNoteEmailAttachment({
          orgSlug: params.orgSlug,
          creditNoteId: params.creditNoteId,
        })
      : null;

  return {
    subject,
    bodyText,
    creditNoteReference: templateValues.comprobante,
    attachment,
  };
}

export async function sendCreditNoteEmail(
  params: SendCreditNoteEmailParams
): Promise<CreditNoteEmailResult> {
  const [creditNote, organization, orgSettings] = await Promise.all([
    getCreditNoteById(params.orgSlug, params.creditNoteId),
    getOrganizationBySlug(params.orgSlug),
    getOrgSettings(params.orgSlug),
  ]);

  if (!(creditNote && organization)) {
    throw new Error("No se pudo preparar el email de nota de crédito.");
  }

  if (creditNote.arcaStatus !== "authorized") {
    await markCreditNoteEmailFailed({
      creditNoteId: creditNote.id,
      recipient: getDefaultCreditNoteEmailRecipientSource(creditNote),
      message:
        "La nota de crédito todavía no tiene comprobante fiscal autorizado.",
    });

    return {
      sent: false,
      reason: "credit_note_not_authorized",
      message:
        "La nota de crédito todavía no tiene comprobante fiscal autorizado.",
    };
  }

  const recipientResolution = resolveCreditNoteEmailRecipients({
    creditNote,
    recipients: params.recipients,
  });

  if (!recipientResolution.ok) {
    await markCreditNoteEmailFailed({
      creditNoteId: creditNote.id,
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

  await markCreditNoteEmailPending({
    creditNoteId: creditNote.id,
    recipient,
  });

  try {
    const resend = createResendClient();
    const emailMessage = await buildCreditNoteEmailMessage({
      orgSlug: params.orgSlug,
      creditNoteId: params.creditNoteId,
      creditNote,
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
      react: CreditNoteEmail({
        bodyText: emailMessage.bodyText,
        creditNoteNumber: emailMessage.creditNoteReference,
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
      const message = `Error enviando nota de crédito por email: ${error.message}`;
      await markCreditNoteEmailFailed({
        creditNoteId: creditNote.id,
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
    await markCreditNoteEmailSent({
      creditNoteId: creditNote.id,
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
    const message = `Error enviando nota de crédito por email: ${getErrorMessage(error)}`;
    await markCreditNoteEmailFailed({
      creditNoteId: creditNote.id,
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

export async function updateCreditNoteEmailStateByResendId(params: {
  supabase: SupabaseDatabaseClient;
  resendId: string;
  patch: CreditNoteEmailWebhookPatch;
}): Promise<void> {
  const { error } = await params.supabase
    .from("credit_notes")
    .update({
      ...params.patch,
      updated_at: new Date().toISOString(),
    })
    .eq("invoice_email_resend_id", params.resendId);

  if (error) {
    throw new Error(
      `No se pudo actualizar el estado del webhook de Resend para nota de crédito: ${error.message}`
    );
  }
}
