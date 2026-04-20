"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  buildCreditNotePDFData,
  generateCreditNoteHTML,
  type ReturnItem,
} from "../service/credit-note-pdf.service";
import { getCreditNoteById } from "../service/credit-notes.service";

type GenerateCreditNotePDFResult =
  | { success: true; html: string; creditNoteNumber: string | null }
  | { success: false; error: string };

export async function generateCreditNotePDFAction(
  orgSlug: string,
  creditNoteId: string
): Promise<GenerateCreditNotePDFResult> {
  try {
    const [creditNote, organization] = await Promise.all([
      getCreditNoteById(orgSlug, creditNoteId),
      getOrganizationBySlug(orgSlug),
    ]);

    if (!creditNote) {
      return { success: false, error: "Nota de crédito no encontrada" };
    }

    let returnItems: ReturnItem[] | null = null;

    if (creditNote.salesReturnId) {
      const supabase = await createClient();
      // @ts-expect-error: sales_return_items types pending regeneration
      const { data } = await supabase
        .from("sales_return_items")
        .select("quantity, unit_price, credit_amount, products(name)")
        .eq("sales_return_id", creditNote.salesReturnId);

      if (data) {
        // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
        returnItems = (data as any[]).map((row) => ({
          productName: row.products?.name ?? "—",
          quantity: Number(row.quantity),
          unitPrice: Number(row.unit_price),
          creditAmount: Number(row.credit_amount),
        }));
      }
    }

    const pdfData = buildCreditNotePDFData(
      creditNote,
      organization?.name ?? "Empresa",
      organization?.cuit,
      returnItems
    );
    const html = generateCreditNoteHTML(pdfData);

    return {
      success: true,
      html,
      creditNoteNumber: creditNote.creditNoteNumber,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al generar la nota de crédito",
    };
  }
}
