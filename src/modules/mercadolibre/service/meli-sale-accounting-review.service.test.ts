import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewMeliSaleAccounting } from "./meli-sale-accounting-review.service";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  enabled: vi.fn(),
  module: vi.fn(),
  auth: vi.fn(),
  org: vi.fn(),
  rpc: vi.fn(),
  fiscal: vi.fn(),
  preparations: vi.fn(),
  entries: vi.fn(),
  reversal: vi.fn(),
  dispatch: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuth: mocks.auth }));
vi.mock("@/modules/accounting/service/accounting-integration.service", () => ({
  isMeliAccountingIntegrationEnabled: mocks.enabled,
}));
vi.mock("@/modules/organizations/service/module-access.service", () => ({
  guardOrganizationModuleAccess: mocks.module,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.org,
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("./meli-fiscal-preparation.service", () => ({
  inspectMeliFiscalDispatch: mocks.fiscal,
}));
vi.mock("./meli-fiscal-accounting-history.service", () => ({
  getMeliFiscalSnapshotForRecovery: mocks.snapshot,
}));
vi.mock("./meli-accounting-drafts.service", () => ({
  listMeliPaymentJournalEntries: mocks.entries,
}));
vi.mock("./meli-payment-preparations.service", () => ({
  listMeliPaymentPreparations: mocks.preparations,
  inspectMeliPaymentReversals: mocks.reversal,
  inspectMeliPaymentDispatch: mocks.dispatch,
}));

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const source = {
  saleId: id(1),
  currency: "USD",
  amount: "90071992547409.91",
  invoiceStatus: "authorized",
  notes: [
    {
      id: id(2),
      amount: "20.00",
      currency: "USD",
      status: "CONFIRMED",
      fiscalStatus: "authorized",
    },
  ],
  payments: [
    { id: id(3), amount: "80.00", currency: "USD", status: "RECORDED" },
  ],
};
const component = {
  key: "net",
  description: "Neto",
  amount: "80.00",
  dispatchStatus: "PUBLISHED",
  journalEntryId: id(5),
};
const preparation = {
  id: id(4),
  draft_id: id(6),
  status: "PREPARED",
  created_by: id(7),
  created_at: "2026-11-23T12:00:00Z",
  cancelled_by: null,
  cancelled_at: null,
  components: [component],
};
const entry = {
  id: id(5),
  org_id: id(8),
  tipo_evento: "MELI_COBRO",
  referencia_id: id(3),
  referencia_tabla: "mercadolibre_payments",
  estado: "ACTIVO",
  idempotency_key: "receipt",
  anulado_por_id: null,
  fecha: "2026-11-23",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockResolvedValue(true);
  mocks.auth.mockResolvedValue({ userId: id(7) });
  mocks.org.mockResolvedValue({ id: id(8) });
  mocks.rpc.mockResolvedValue({ data: source, error: null });
  mocks.fiscal.mockResolvedValue({
    dispatchStatus: "PUBLISHED",
    journalEntryId: id(9),
    historyIssues: [],
  });
  mocks.snapshot.mockImplementation(async (_org, origin) => ({
    currency: "USD",
    total: origin.type === "invoice" ? "90071992547409.91" : "20.00",
  }));
  mocks.preparations.mockResolvedValue([preparation]);
  mocks.entries.mockResolvedValue([entry]);
  mocks.reversal.mockResolvedValue(null);
  mocks.dispatch.mockResolvedValue({
    dispatchStatus: "PUBLISHED",
    journalEntryId: id(5),
  });
});

describe("revisión contable de una venta Meli", () => {
  it("uses scoped identity and reviews invoice, note and payment receipts without changing amounts", async () => {
    const result = await reviewMeliSaleAccounting("org", id(1));
    expect(result.amount).toBe("90071992547409.91");
    expect(result.invoice.dispatchStatus).toBe("PUBLISHED");
    expect(result.notes[0]).toMatchObject({
      status: "CONFIRMED",
      dispatchStatus: "PUBLISHED",
      issues: [],
    });
    expect(result.payments[0].issues).toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_meli_sale_accounting_review", {
      p_org_id: id(8),
      p_actor_id: id(7),
      p_sale_id: id(1),
    });
    expect(mocks.dispatch).toHaveBeenCalledWith("org", {
      paymentId: id(3),
      preparationId: id(4),
      componentKey: "net",
    });
    expect(mocks.fiscal).toHaveBeenCalledTimes(2);
  });

  it("reports missing, uncertain and mismatched sources without claiming reconciliation", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        ...source,
        notes: [{ ...source.notes[0], currency: "ARS" }],
      },
      error: null,
    });
    mocks.fiscal
      .mockResolvedValueOnce({
        dispatchStatus: null,
        journalEntryId: null,
        historyIssues: ["Asiento ajeno"],
      })
      .mockResolvedValueOnce({
        dispatchStatus: "UNCERTAIN",
        journalEntryId: null,
        historyIssues: [],
      });
    mocks.preparations.mockResolvedValueOnce([
      {
        ...preparation,
        components: [
          { ...component, dispatchStatus: "UNCERTAIN", journalEntryId: null },
        ],
      },
    ]);
    mocks.entries.mockResolvedValueOnce([]);
    mocks.dispatch.mockResolvedValueOnce({
      dispatchStatus: "UNCERTAIN",
      journalEntryId: null,
    });
    const result = await reviewMeliSaleAccounting("org", id(1));
    expect(result.invoice.issues.join(" ")).toContain("Asiento ajeno");
    expect(result.invoice.issues.join(" ")).toContain("Sin envío");
    expect(result.notes[0].issues.join(" ")).toContain("moneda");
    expect(result.notes[0].issues.join(" ")).toContain("incierto");
    expect(result.payments[0].issues.join(" ")).toContain("incierto");
  });

  it("does not mistake a reserved reversal for an annulled payment", async () => {
    mocks.reversal.mockResolvedValueOnce({
      status: "RESERVED",
      historyIssues: ["Requiere revisión"],
      components: [{ confirmed: false }],
    });
    const result = await reviewMeliSaleAccounting("org", id(1));
    expect(result.payments[0].issues.join(" ")).toContain("en curso");
    expect(result.payments[0].issues.join(" ")).toContain("sin confirmar");
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("warns when dependent postings exist and the published invoice has conflicting history", async () => {
    mocks.fiscal.mockResolvedValueOnce({
      dispatchStatus: "PUBLISHED",
      journalEntryId: id(9),
      historyIssues: ["Historia fiscal conflictiva"],
    });
    const result = await reviewMeliSaleAccounting("org", id(1));
    expect(result.issues.join(" ")).toContain("factura publicada verificada");
  });

  it("reports an empty active preparation even if a cancelled one has a dispatch", async () => {
    mocks.preparations.mockResolvedValueOnce([
      { ...preparation, components: [] },
      { ...preparation, id: id(11), status: "CANCELLED" },
    ]);
    const result = await reviewMeliSaleAccounting("org", id(1));
    expect(result.payments[0].issues.join(" ")).toContain(
      "no tiene componentes verificables"
    );
  });

  it("reports inconsistent payment and reversal snapshots", async () => {
    mocks.reversal.mockResolvedValueOnce({
      status: "VOIDED",
      historyIssues: [],
      components: [{ confirmed: true }],
    });
    const result = await reviewMeliSaleAccounting("org", id(1));
    expect(result.payments[0].issues.join(" ")).toContain(
      "no coincide con la reversión"
    );
  });

  it("allows the same identifier in different source tables", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ...source, payments: [{ ...source.payments[0], id: id(2) }] },
      error: null,
    });
    const result = await reviewMeliSaleAccounting("org", id(1));
    expect(result.notes[0].id).toBe(result.payments[0].id);
  });

  it("reports fiscal snapshot, authorization and currency discrepancies", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        ...source,
        invoiceStatus: "error",
        notes: [{ ...source.notes[0], fiscalStatus: "error" }],
        payments: [{ ...source.payments[0], currency: "ARS" }],
      },
      error: null,
    });
    mocks.snapshot.mockImplementation(async (_org, origin) => ({
      currency: "USD",
      total: origin.type === "invoice" ? "1.00" : "20.00",
    }));
    const result = await reviewMeliSaleAccounting("org", id(1));
    expect(result.invoice.issues.join(" ")).toContain("no coincide");
    expect(result.invoice.issues.join(" ")).toContain("autorización fiscal");
    expect(result.notes[0].issues.join(" ")).toContain("autorizado");
    expect(result.payments[0].issues.join(" ")).toContain("moneda");
    expect(result.issues.join(" ")).toContain("factura publicada verificada");
  });

  it("reports voided payments with dispatches but no reversal reservation", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        ...source,
        payments: [{ ...source.payments[0], status: "VOIDED" }],
      },
      error: null,
    });
    const result = await reviewMeliSaleAccounting("org", id(1));
    expect(result.payments[0].issues.join(" ")).toContain(
      "sin reserva de reversión"
    );
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("propagates receipt lookup failures instead of returning a partial review", async () => {
    mocks.dispatch.mockRejectedValueOnce(new Error("Recibo no verificable"));
    await expect(reviewMeliSaleAccounting("org", id(1))).rejects.toThrow(
      "Recibo no verificable"
    );
  });

  it("rejects direct requests when the accounting integration is disabled", async () => {
    mocks.enabled.mockResolvedValueOnce(false);
    await expect(reviewMeliSaleAccounting("org", id(1))).rejects.toThrow(
      "no está habilitada"
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fiscal).not.toHaveBeenCalled();
  });

  it("rejects foreign source IDs, duplicates, permission and accounting failures", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ...source, saleId: id(10) },
      error: null,
    });
    await expect(reviewMeliSaleAccounting("org", id(1))).rejects.toThrow(
      "diferente"
    );
    mocks.rpc.mockResolvedValueOnce({
      data: { ...source, payments: [source.payments[0], source.payments[0]] },
      error: null,
    });
    await expect(reviewMeliSaleAccounting("org", id(1))).rejects.toThrow(
      "duplicados"
    );
    mocks.ensure.mockRejectedValueOnce(new Error("Sin permiso"));
    await expect(reviewMeliSaleAccounting("org", id(1))).rejects.toThrow(
      "Sin permiso"
    );
    mocks.fiscal.mockRejectedValueOnce(new Error("Contabilidad no disponible"));
    await expect(reviewMeliSaleAccounting("org", id(1))).rejects.toThrow(
      "Contabilidad no disponible"
    );
  });
});
