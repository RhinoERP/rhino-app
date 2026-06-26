import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSaleReturn } from "@/modules/sales/service/sale-return.service";
import { createReturnCreditNoteFromCreditNotesSection } from "./return-credit-note.service";

const CREATE_ERROR_PATTERN = /No se pudo crear/;

vi.mock("@/modules/sales/service/sale-return.service", () => ({
  createSaleReturn: vi.fn(),
}));

const createSaleReturnMock = vi.mocked(createSaleReturn);

describe("createReturnCreditNoteFromCreditNotesSection", () => {
  beforeEach(() => {
    createSaleReturnMock.mockReset();
  });

  it("crea devolución forzando creación de nota de crédito", async () => {
    createSaleReturnMock.mockResolvedValue({
      returnId: "return-1",
      returnTotal: 205.7,
      creditNoteId: "credit-note-1",
      creditNoteNumber: "NC-0001",
    });

    await expect(
      createReturnCreditNoteFromCreditNotesSection({
        orgSlug: "org",
        saleId: "sale-1",
        reason: "Producto devuelto",
        notes: null,
        items: [
          {
            salesOrderItemId: "sale-item-1",
            productId: "product-1",
            quantity: 2,
            unitPrice: 100,
          },
        ],
      })
    ).resolves.toEqual({
      returnId: "return-1",
      returnTotal: 205.7,
      creditNoteId: "credit-note-1",
      creditNoteNumber: "NC-0001",
    });

    expect(createSaleReturnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emitCreditNote: true,
        requireCreditNote: true,
      })
    );
  });

  it("falla si la devolución no devuelve id y número de NC", async () => {
    createSaleReturnMock.mockResolvedValue({
      returnId: "return-1",
      returnTotal: 205.7,
      creditNoteId: null,
      creditNoteNumber: null,
    });

    await expect(
      createReturnCreditNoteFromCreditNotesSection({
        orgSlug: "org",
        saleId: "sale-1",
        reason: "Producto devuelto",
        items: [],
      })
    ).rejects.toThrow(CREATE_ERROR_PATTERN);
  });
});
