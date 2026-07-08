import "server-only";

import { createClient } from "@/lib/supabase/server";
import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import { getOrganizationArcaSettingsByOrganizationId } from "@/modules/arca/server/repository";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  buildCreditNotePDFData,
  generateCreditNoteHTML,
  type ReturnItem,
} from "./credit-note-pdf.service";
import { getCreditNoteById } from "./credit-notes.service";

type CreditNotePdfDocument = {
  filename: string;
  html: string;
  content: Buffer;
};

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_");
}

async function getCreditNoteReturnItems(
  salesReturnId: string | null
): Promise<ReturnItem[] | null> {
  if (!salesReturnId) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_return_items")
    .select(
      "quantity, unit_price, credit_amount, unit_quantity, products(name, sku, unit_of_measure)"
    )
    .eq("sales_return_id", salesReturnId);

  if (!data) {
    return null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (data as any[]).map((row) => ({
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

function getCreditNotePdfFilename(params: {
  creditNoteNumber: string | null;
  fiscalNumber: string | null;
  creditNoteId: string;
}): string {
  const reference =
    params.fiscalNumber || params.creditNoteNumber || params.creditNoteId;

  return `nota-credito-${sanitizeFilenamePart(reference)}.pdf`;
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

export async function generateCreditNotePdfDocument(params: {
  orgSlug: string;
  creditNoteId: string;
}): Promise<CreditNotePdfDocument> {
  const [creditNote, organization] = await Promise.all([
    getCreditNoteById(params.orgSlug, params.creditNoteId),
    getOrganizationBySlug(params.orgSlug),
  ]);

  if (!creditNote) {
    throw new Error("Nota de crédito no encontrada.");
  }

  const arcaSettings = organization?.id
    ? await getOrganizationArcaSettingsByOrganizationId(organization.id)
    : null;
  const returnItems =
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
      : await getCreditNoteReturnItems(creditNote.salesReturnId);
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
  const content = await renderHtmlToPdfBuffer(html);

  return {
    filename: getCreditNotePdfFilename({
      creditNoteId: creditNote.id,
      creditNoteNumber: creditNote.creditNoteNumber,
      fiscalNumber: formatArcaNumber(
        creditNote.arcaPointOfSale,
        creditNote.arcaVoucherNumber
      ),
    }),
    html,
    content,
  };
}
