import "server-only";

import { createClient } from "@/lib/supabase/server";
import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
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
    .select("quantity, unit_price, credit_amount, products(name)")
    .eq("sales_return_id", salesReturnId);

  if (!data) {
    return null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (data as any[]).map((row) => ({
    productName: row.products?.name ?? "—",
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

  const returnItems =
    creditNote.items.length > 0
      ? creditNote.items.map((item) => ({
          productName: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          creditAmount: item.totalAmount,
        }))
      : await getCreditNoteReturnItems(creditNote.salesReturnId);
  const pdfData = buildCreditNotePDFData(
    creditNote,
    organization?.name ?? "Empresa",
    organization?.cuit,
    returnItems
  );
  const html = generateCreditNoteHTML(pdfData);
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
