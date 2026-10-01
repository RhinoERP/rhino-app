import "server-only";

import { generateAuthorizedManualFiscalInvoicePdfDocument } from "@/modules/arca/server/manual-fiscal-invoice-pdf.service";
import { getManualFiscalInvoiceById } from "@/modules/arca/server/manual-fiscal-invoices.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { createResendClient } from "../client";
import { SaleInvoiceEmail } from "../templates/sale-invoice-email";

const DEFAULT_FROM_EMAIL = "empresa@rhinosapp.com";
const DEFAULT_FROM_NAME = "Rhino";
const EMAIL_SEPARATOR_REGEX = /[\s,;]+/u;
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type ManualFiscalInvoiceEmailResult =
  | { sent: true; recipients: string[] }
  | { sent: false; message: string };

function resolveRecipients(value: string | null | undefined): {
  recipients: string[];
  invalid: string[];
} {
  const recipients: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const raw of value?.split(EMAIL_SEPARATOR_REGEX) ?? []) {
    const email = raw.trim();
    if (!email) {
      continue;
    }
    if (!SIMPLE_EMAIL_REGEX.test(email)) {
      invalid.push(email);
      continue;
    }
    if (!seen.has(email.toLowerCase())) {
      seen.add(email.toLowerCase());
      recipients.push(email);
    }
  }

  return { recipients, invalid };
}

export async function sendManualFiscalInvoiceEmail(params: {
  orgSlug: string;
  invoiceId: string;
}): Promise<ManualFiscalInvoiceEmailResult> {
  const [invoice, organization] = await Promise.all([
    getManualFiscalInvoiceById(params),
    getOrganizationBySlug(params.orgSlug),
  ]);
  if (!(organization && invoice.status === "authorized")) {
    return {
      sent: false,
      message: "La factura manual todavía no está autorizada para enviar.",
    };
  }

  const { recipients, invalid } = resolveRecipients(
    invoice.email_recipients || invoice.customer?.email
  );
  if (invalid.length) {
    return {
      sent: false,
      message: `Hay emails inválidos: ${invalid.join(", ")}.`,
    };
  }
  if (!recipients.length) {
    return {
      sent: false,
      message: "No hay destinatarios de email cargados.",
    };
  }

  const printable =
    await generateAuthorizedManualFiscalInvoicePdfDocument(params);
  const invoiceNumber = invoice.invoice_number ?? invoice.id;
  const subject =
    invoice.email_subject?.trim() || `Factura electrónica ${invoiceNumber}`;
  const bodyText =
    invoice.email_body?.trim() ||
    `Hola ${
      invoice.customer?.fantasy_name || invoice.customer?.business_name || ""
    },\n\nTe enviamos la factura electrónica ${invoiceNumber}, emitida por ${organization.name}.`;
  const fromEmail =
    process.env.RESEND_INVOICE_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    DEFAULT_FROM_EMAIL;
  const fromName =
    process.env.RESEND_INVOICE_FROM_NAME ||
    process.env.RESEND_FROM_NAME ||
    organization.name ||
    DEFAULT_FROM_NAME;
  const resend = createResendClient();
  const { error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: recipients,
    subject,
    react: SaleInvoiceEmail({
      bodyText,
      invoiceNumber,
      previewText: subject,
    }),
    attachments: [
      {
        filename: printable.filename,
        content: printable.content,
        contentType: "application/pdf",
      },
    ],
  });
  if (error) {
    return {
      sent: false,
      message: `No se pudo enviar la factura por email: ${error.message}`,
    };
  }

  return { sent: true, recipients };
}
