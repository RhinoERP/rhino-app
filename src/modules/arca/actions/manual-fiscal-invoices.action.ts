"use server";

import { revalidatePath } from "next/cache";
import { sendManualFiscalInvoiceEmail } from "@/modules/email/service/send-manual-fiscal-invoice-email";
import { toArcaUserMessage } from "../errors";
import { generateAuthorizedManualFiscalInvoicePdfDocument } from "../server/manual-fiscal-invoice-pdf.service";
import {
  createManualFiscalInvoice,
  emitManualFiscalInvoice,
  type ManualFiscalInvoiceInput,
  manualFiscalInvoiceSchema,
} from "../server/manual-fiscal-invoices.service";

export async function createManualFiscalInvoiceAction(
  input: ManualFiscalInvoiceInput
) {
  const parsed = manualFiscalInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  try {
    const invoice = await createManualFiscalInvoice(parsed.data);
    revalidatePath(`/org/${input.orgSlug}/arca/facturas`);
    return { success: true as const, invoice };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  }
}

export async function emitManualFiscalInvoiceAction(input: {
  orgSlug: string;
  invoiceId: string;
}) {
  try {
    const invoice = await emitManualFiscalInvoice(input);
    const email = invoice.email_recipients?.trim()
      ? await sendManualFiscalInvoiceEmail(input)
      : null;
    revalidatePath(`/org/${input.orgSlug}/arca/facturas`);
    revalidatePath(`/org/${input.orgSlug}/cobranzas`);
    return {
      success: true as const,
      invoice,
      emailWarning: email && !email.sent ? email.message : null,
    };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  }
}

export async function downloadManualFiscalInvoicePdfAction(input: {
  orgSlug: string;
  invoiceId: string;
}) {
  try {
    const document =
      await generateAuthorizedManualFiscalInvoicePdfDocument(input);
    return {
      success: true as const,
      filename: document.filename,
      pdfBase64: document.content.toString("base64"),
    };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  }
}
