import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeliConfirmationError } from "../errors";
import type { CreateMeliSaleInput } from "../types";
import { createMercadoLibreSaleAction } from "./create-mercadolibre-sale.action";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  invoice: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../service/mercadolibre-sales.service", () => ({
  createMercadoLibreSale: mocks.create,
}));
vi.mock("../service/meli-invoice.service", () => ({
  tryAutomaticMeliInvoice: mocks.invoice,
}));
const input: CreateMeliSaleInput = {
  orgSlug: "org",
  warehouseId: "warehouse",
  idempotencyKey: "key",
  marketplaceOrderNumber: "ML-1",
  saleDate: "2026-11-15",
  invoiceType: "FACTURA_B",
  receiver: {
    version: 1,
    tax_condition: "CONSUMIDOR_FINAL",
    document_type: "DNI",
    document_number: "12345678",
    first_name: "Ana",
    last_name: "Pérez",
    address: "Calle 123",
  },
  items: [],
};

describe("Meli checkout separates commercial and fiscal outcomes", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns the committed sale even if ARCA cannot issue its invoice", async () => {
    mocks.create.mockResolvedValue({ saleId: "sale", idempotent: false });
    mocks.invoice.mockResolvedValue("ARCA no disponible");
    expect(await createMercadoLibreSaleAction(input)).toEqual({
      success: true,
      data: { saleId: "sale", idempotent: false },
      fiscalWarning: "ARCA no disponible",
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.invoice).toHaveBeenCalledWith("org", "sale");
  });
  it("does not issue any invoice after the commercial transaction fails", async () => {
    mocks.create.mockRejectedValue(
      new MeliConfirmationError("Stock insuficiente", true)
    );
    expect(await createMercadoLibreSaleAction(input)).toMatchObject({
      success: false,
      canEdit: true,
    });
    expect(mocks.invoice).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
