import { beforeEach, describe, expect, it, vi } from "vitest";

const loadPosSaleAccountingRow = vi.fn();
const persistPosSaleAccountingPatch = vi.fn();
const runPosSaleAccountingFlow = vi.fn();
const formalizeSinglePosSaleAccountingEntry = vi.fn();
const rebuildPosSaleAccountingEvent = vi.fn();

vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: vi.fn(),
}));

vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: vi.fn(async () => ({ id: "org-1" })),
}));

vi.mock("@/modules/organizations/service/org-settings.service", () => ({
  getOrgSettings: vi.fn(async () => ({ automatic_accounting_enabled: true })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}));

vi.mock("../service/pos-sale-accounting.service", () => ({
  loadPosSaleAccountingRow: (...args: unknown[]) =>
    loadPosSaleAccountingRow(...args),
  persistPosSaleAccountingPatch: (...args: unknown[]) =>
    persistPosSaleAccountingPatch(...args),
  runPosSaleAccountingFlow: (...args: unknown[]) =>
    runPosSaleAccountingFlow(...args),
  formalizeSinglePosSaleAccountingEntry: (...args: unknown[]) =>
    formalizeSinglePosSaleAccountingEntry(...args),
}));

vi.mock("../service/pos.service", () => ({
  rebuildPosSaleAccountingEvent: (...args: unknown[]) =>
    rebuildPosSaleAccountingEvent(...args),
}));

const { retryPosSaleAccountingAction } = await import(
  "./retry-pos-sale-accounting.action"
);

const snapshot = { referenciaId: "sale-1" };

beforeEach(() => {
  vi.clearAllMocks();
  persistPosSaleAccountingPatch.mockResolvedValue(null);
});

describe("retryPosSaleAccountingAction", () => {
  it("formaliza sin recrear el asiento si ARCA ya autorizó", async () => {
    loadPosSaleAccountingRow.mockResolvedValue({
      invoice_type: "FACTURA_B",
      arca_status: "authorized",
      accounting_status: "FORMALIZATION_ERROR",
      accounting_sale_entry_id: "informal-1",
      accounting_sale_event_snapshot: snapshot,
    });
    formalizeSinglePosSaleAccountingEntry.mockResolvedValue({
      accounting_status: "POSTED",
    });

    const result = await retryPosSaleAccountingAction({
      orgSlug: "org",
      posSaleIds: ["sale-1"],
    });

    expect(runPosSaleAccountingFlow).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      results: [
        { posSaleId: "sale-1", success: true, accountingStatus: "POSTED" },
      ],
    });
  });

  it("reconstruye el evento cuando la venta no tiene snapshot", async () => {
    loadPosSaleAccountingRow.mockResolvedValue({
      invoice_type: "TICKET_X",
      arca_status: null,
      accounting_status: "REVIEW_REQUIRED",
      accounting_sale_entry_id: null,
      accounting_sale_event_snapshot: null,
    });
    rebuildPosSaleAccountingEvent.mockResolvedValue({
      kind: "ready",
      evento: snapshot,
    });
    runPosSaleAccountingFlow.mockResolvedValue({
      accounting_status: "SETTLED_INFORMAL",
    });

    await retryPosSaleAccountingAction({
      orgSlug: "org",
      posSaleIds: ["sale-1"],
    });

    expect(runPosSaleAccountingFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        eventoVenta: snapshot,
        isTicketX: true,
        automaticAccountingEnabled: true,
      })
    );
  });

  it("deja la venta en revisión si no se puede reconstruir el evento", async () => {
    loadPosSaleAccountingRow.mockResolvedValue({
      invoice_type: "TICKET_X",
      arca_status: null,
      accounting_status: "ERROR",
      accounting_sale_entry_id: null,
      accounting_sale_event_snapshot: null,
    });
    rebuildPosSaleAccountingEvent.mockResolvedValue({
      kind: "unavailable",
      reason: "Falta Consumidor Final",
    });

    const result = await retryPosSaleAccountingAction({
      orgSlug: "org",
      posSaleIds: ["sale-1"],
    });

    expect(persistPosSaleAccountingPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          accounting_status: "REVIEW_REQUIRED",
          accounting_last_error: "Falta Consumidor Final",
        }),
      })
    );
    expect(result).toEqual({
      success: true,
      results: [
        {
          posSaleId: "sale-1",
          success: false,
          error: "Falta Consumidor Final",
        },
      ],
    });
  });

  it("ignora ventas ya contabilizadas", async () => {
    loadPosSaleAccountingRow.mockResolvedValue({
      invoice_type: "FACTURA_B",
      arca_status: "authorized",
      accounting_status: "POSTED",
      accounting_sale_entry_id: "journal-1",
      accounting_sale_event_snapshot: snapshot,
    });

    const result = await retryPosSaleAccountingAction({
      orgSlug: "org",
      posSaleIds: ["sale-1"],
    });

    expect(formalizeSinglePosSaleAccountingEntry).not.toHaveBeenCalled();
    expect(runPosSaleAccountingFlow).not.toHaveBeenCalled();
    expect(result.success && result.results[0]?.success).toBe(false);
  });

  it("rechaza lotes vacíos", async () => {
    const result = await retryPosSaleAccountingAction({
      orgSlug: "org",
      posSaleIds: [],
    });

    expect(result.success).toBe(false);
  });
});
