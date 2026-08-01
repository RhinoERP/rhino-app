import "server-only";

import { createClient } from "@/lib/supabase/server";
import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import { generateDebitNotePDFAction } from "@/modules/debit-notes/actions/generate-debit-note-pdf.action";
import { getDebitNoteById } from "@/modules/debit-notes/service/debit-notes.service";
import {
  getOrganizationBySlug,
  getOrganizationLayoutData,
} from "@/modules/organizations/service/organizations.service";
import { createResendClient } from "../client";
import { DebitNoteEmail } from "../templates/debit-note-email";

export async function sendDebitNoteEmail(params: {
  orgSlug: string;
  debitNoteId: string;
}) {
  const layout = await getOrganizationLayoutData(params.orgSlug);
  const canManage =
    layout?.permissions.includes("organization.admin") ||
    layout?.permissions.includes("debitnotes.manage");
  if (!canManage) {
    throw new Error(
      "No tenés permisos para enviar la Nota de Débito por email."
    );
  }
  const [debitNote, organization] = await Promise.all([
    getDebitNoteById(params.orgSlug, params.debitNoteId),
    getOrganizationBySlug(params.orgSlug),
  ]);
  if (!(debitNote && organization)) {
    throw new Error("No se pudo preparar el email de la Nota de Débito.");
  }
  if (debitNote.status !== "authorized") {
    throw new Error("La Nota de Débito todavía no fue autorizada por ARCA.");
  }
  const recipient = debitNote.customer?.email?.trim();
  if (!recipient) {
    throw new Error("El cliente no tiene un email configurado.");
  }
  const pdf = await generateDebitNotePDFAction(
    params.orgSlug,
    params.debitNoteId
  );
  if (!pdf.success) {
    throw new Error(pdf.error);
  }
  const client = await createClient();
  const db = client as unknown as {
    // biome-ignore lint/suspicious/noExplicitAny: migration-owned table until generated types are refreshed.
    from: (table: string) => any;
  };
  await db
    .from("debit_notes")
    .update({
      invoice_email_status: "pending",
      invoice_email_recipient: recipient,
      invoice_email_last_error: null,
    })
    .eq("id", debitNote.id);
  try {
    const content = await renderHtmlToPdfBuffer(pdf.html);
    const reference =
      debitNote.arcaPointOfSale && debitNote.arcaVoucherNumber
        ? `${String(debitNote.arcaPointOfSale).padStart(4, "0")}-${String(debitNote.arcaVoucherNumber).padStart(8, "0")}`
        : debitNote.debitNoteNumber;
    const subject = `Nota de débito electrónica ${reference}`;
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: `${organization.name} <${process.env.RESEND_INVOICE_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "facturacion@rhino.app"}>`,
      to: [recipient],
      subject,
      react: DebitNoteEmail({
        debitNoteNumber: reference,
        previewText: subject,
        bodyText: `Hola,\n\nTe enviamos la nota de débito electrónica ${reference}, emitida por ${organization.name}.`,
      }),
      attachments: [
        {
          filename: `nota-debito-${reference}.pdf`,
          content,
          contentType: "application/pdf",
        },
      ],
    });
    if (error) {
      throw new Error(error.message);
    }
    await db
      .from("debit_notes")
      .update({
        invoice_email_status: "sent",
        invoice_email_sent_at: new Date().toISOString(),
        invoice_email_last_error: null,
      })
      .eq("id", debitNote.id);
    return { sent: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo enviar el email.";
    await db
      .from("debit_notes")
      .update({
        invoice_email_status: "failed",
        invoice_email_last_error: message,
      })
      .eq("id", debitNote.id);
    return { sent: false as const, error: message };
  }
}
