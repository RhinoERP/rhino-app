"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationArcaSettingsByOrganizationId } from "@/modules/arca/server/repository";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
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
  await ensure("creditnotes.manage", orgSlug);
  try {
    const [creditNote, organization] = await Promise.all([
      getCreditNoteById(orgSlug, creditNoteId),
      getOrganizationBySlug(orgSlug),
    ]);

    if (!creditNote) {
      return { success: false, error: "Nota de crédito no encontrada" };
    }

    const arcaSettings = organization?.id
      ? await getOrganizationArcaSettingsByOrganizationId(organization.id)
      : null;
    let returnItems: ReturnItem[] | null =
      creditNote.items.length > 0
        ? creditNote.items.map((item) => ({
            productName: item.description,
            productSku: item.productSku,
            unitOfMeasure: item.productUnitOfMeasure,
            weightQuantity: item.weightQuantity,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            discountPercent: item.discountPercent,
            netAmount: item.netAmount,
            taxAmount: item.taxAmount,
            creditAmount: item.totalAmount,
          }))
        : null;

    if (!returnItems && creditNote.salesReturnId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("sales_return_items")
        .select(
          "quantity, unit_price, credit_amount, unit_quantity, products(name, sku, unit_of_measure)"
        )
        .eq("sales_return_id", creditNote.salesReturnId);

      if (data) {
        // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
        returnItems = (data as any[]).map((row) => ({
          productName: row.products?.name ?? "—",
          productSku: row.products?.sku ?? null,
          unitOfMeasure: row.products?.unit_of_measure ?? null,
          weightQuantity:
            row.unit_quantity === null || row.unit_quantity === undefined
              ? null
              : Number(row.unit_quantity),
          quantity: Number(row.quantity),
          unitPrice: Number(row.unit_price),
          creditAmount: Number(row.credit_amount),
        }));
      }
    }

    const pdfData = buildCreditNotePDFData({
      creditNote,
      issuerName: organization?.name ?? "Empresa",
      issuerCuit: organization?.cuit,
      returnItems,
      branding: {
        issuerBusinessName: arcaSettings?.issuer_business_name ?? null,
        issuerLegalAddress: arcaSettings?.issuer_legal_address ?? null,
        issuerLogoUrl: arcaSettings?.issuer_logo_data_url ?? null,
      },
    });
    const html = await generateCreditNoteHTML(pdfData);

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
