import {
  type CreateSaleReturnResult,
  createSaleReturn,
  type SaleReturnItemInput,
} from "@/modules/sales/service/sale-return.service";

export type CreateReturnCreditNoteInput = {
  orgSlug: string;
  saleId: string;
  reason: string;
  notes?: string | null;
  items: SaleReturnItemInput[];
};

export type CreateReturnCreditNoteResult = CreateSaleReturnResult & {
  creditNoteId: string;
  creditNoteNumber: string;
};

export async function createReturnCreditNoteFromCreditNotesSection(
  input: CreateReturnCreditNoteInput
): Promise<CreateReturnCreditNoteResult> {
  const result = await createSaleReturn({
    orgSlug: input.orgSlug,
    saleId: input.saleId,
    reason: input.reason,
    notes: input.notes ?? null,
    items: input.items,
    emitCreditNote: true,
    requireCreditNote: true,
  });

  if (!(result.creditNoteId && result.creditNoteNumber)) {
    throw new Error("No se pudo crear la nota de crédito de la devolución");
  }

  return {
    ...result,
    creditNoteId: result.creditNoteId,
    creditNoteNumber: result.creditNoteNumber,
  };
}
