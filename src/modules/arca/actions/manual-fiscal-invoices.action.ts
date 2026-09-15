"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
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
    revalidatePath(`/org/${input.orgSlug}/arca/facturas`);
    revalidatePath(`/org/${input.orgSlug}/cobranzas`);
    return { success: true as const, invoice };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  }
}
