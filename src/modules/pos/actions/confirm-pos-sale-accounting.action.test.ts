import { beforeEach, describe, expect, it, vi } from "vitest";

const getInformalEntryServer = vi.fn();
const runPosSaleAccountingFlow = vi.fn();
const loadPosSaleAccountingRow = vi.fn();
const persistPosSaleAccountingPatch = vi.fn();

vi.mock("@/lib/accounting-server", () => ({
  getInformalEntryServer: (...args: unknown[]) =>
    getInformalEntryServer(...args),
}));

vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: vi.fn(),
}));

vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: vi.fn(async () => ({ id: "org-1" })),
}));

vi.mock("../service/pos-sale-accounting.service", () => ({
  runPosSaleAccountingFlow: (...args: unknown[]) =>
    runPosSaleAccountingFlow(...args),
  loadPosSaleAccountingRow: (...args: unknown[]) =>
    loadPosSaleAccountingRow(...args),
  persistPosSaleAccountingPatch: (...args: unknown[]) =>
    persistPosSaleAccountingPatch(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}));

const { confirmPosSaleAccountingAction } = await import(
  "./confirm-pos-sale-accounting.action"
);

const input = {
  orgSlug: "org",
  posSaleId: "sale-1",
  informalEntryId: "informal-1",
};

const reviewRow = {
  invoice_type: "FACTURA_B",
  arca_status: "authorized",
  accounting_status: "REVIEW_REQUIRED",
  accounting_sale_entry_id: null,
  accounting_sale_event_snapshot: { referenciaId: "sale-1" },
};

const matchingEntry = {
  id: "informal-1",
  referencia_id: "sale-1",
  referencia_tabla: "pos_sales",
  source_type: "VENTA_POS",
  estado_formalizacion: "PENDIENTE",
};

beforeEach(() => {
  vi.clearAllMocks();
  loadPosSaleAccountingRow.mockResolvedValue(reviewRow);
  persistPosSaleAccountingPatch.mockResolvedValue(null);
  runPosSaleAccountingFlow.mockResolvedValue({ accounting_status: "POSTED" });
});

describe("confirmPosSaleAccountingAction", () => {
  it("rechaza un asiento de otra venta", async () => {
    getInformalEntryServer.mockResolvedValue({
      ...matchingEntry,
      referencia_id: "sale-2",
    });

    const result = await confirmPosSaleAccountingAction(input);

    expect(result.success).toBe(false);
    expect(runPosSaleAccountingFlow).not.toHaveBeenCalled();
  });

  it("rechaza un asiento con otro source_type", async () => {
    getInformalEntryServer.mockResolvedValue({
      ...matchingEntry,
      source_type: "COBRO",
    });

    const result = await confirmPosSaleAccountingAction(input);

    expect(result.success).toBe(false);
    expect(runPosSaleAccountingFlow).not.toHaveBeenCalled();
  });

  it("rechaza si la venta ya tiene otro asiento vinculado", async () => {
    loadPosSaleAccountingRow.mockResolvedValue({
      ...reviewRow,
      accounting_sale_entry_id: "informal-9",
    });

    const result = await confirmPosSaleAccountingAction(input);

    expect(result.success).toBe(false);
    expect(getInformalEntryServer).not.toHaveBeenCalled();
  });

  it("rechaza ventas que no están pendientes de revisión", async () => {
    loadPosSaleAccountingRow.mockResolvedValue({
      ...reviewRow,
      accounting_status: "POSTED",
    });

    const result = await confirmPosSaleAccountingAction(input);

    expect(result.success).toBe(false);
    expect(getInformalEntryServer).not.toHaveBeenCalled();
  });

  it("vincula y formaliza cuando el asiento corresponde a la venta autorizada", async () => {
    getInformalEntryServer.mockResolvedValue(matchingEntry);

    const result = await confirmPosSaleAccountingAction(input);

    expect(result).toEqual({ success: true, accountingStatus: "POSTED" });
    expect(runPosSaleAccountingFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        existingSaleEntryId: "informal-1",
        isArcaAuthorized: true,
      })
    );
    expect(persistPosSaleAccountingPatch).toHaveBeenCalledTimes(1);
  });
});
