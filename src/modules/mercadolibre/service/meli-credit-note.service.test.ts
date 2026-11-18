import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMeliCreditNote } from "./meli-credit-note.service";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  auth: vi.fn(),
  source: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
  replay: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuth: mocks.auth }));
vi.mock("./meli-credit-note-read.service", () => ({
  getMeliCreditSource: mocks.source,
}));
vi.mock("@/modules/arca/server/credit-note-invoicing.service", () => ({
  emitCreditNote: vi.fn(),
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

const saleId = "00000000-0000-4000-8000-000000000001";
const input = {
  saleId,
  idempotencyKey: "00000000-0000-4000-8000-000000000002",
  amount: 60.5,
  issueDate: "2026-11-16",
  reason: "Bonificación por diferencia de precio",
};
const receiver = {
  version: 1,
  tax_condition: "CONSUMIDOR_FINAL",
  document_type: "DNI",
  document_number: "12345678",
  first_name: "Ana",
  last_name: "Pérez",
  address: "Calle 123",
};

describe("Meli credit note creation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: "actor" });
    mocks.source.mockResolvedValue({
      scopedSale: { organizationId: "org", customer_id: null, receiver },
      sale: {
        id: saleId,
        sale_date: "2026-11-15",
        invoice_type: "FACTURA_B",
        currency: "ARS",
        total_amount: 121,
        arca_status: "authorized",
        arca_cae: "cae",
        arca_point_of_sale: 2,
        arca_voucher_number: 7,
        arca_voucher_type_code: 6,
        arca_request_json: null,
        taxes: [
          {
            id: "tax",
            tax_id: "vat",
            name: "IVA",
            rate: 21,
            base_amount: 100,
            tax_amount: 21,
            tax_code_snapshot: "IVA_21",
          },
        ],
      },
    });
    const query = {
      select: () => query,
      eq: mocks.eq,
      maybeSingle: mocks.replay,
      insert: mocks.insert,
      single: mocks.single,
    };
    mocks.from.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.insert.mockReturnValue(query);
    mocks.replay.mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockResolvedValue({ data: "NC-00005", error: null });
    mocks.single.mockResolvedValue({ data: { id: "note" }, error: null });
  });
  it("persists an occasional receiver and fiscal snapshot without creating customer credit, stock or accounting entries", async () => {
    expect(await createMeliCreditNote("org", input)).toEqual({
      creditNoteId: "note",
      idempotent: false,
    });
    expect(mocks.ensure.mock.calls).toEqual([
      ["mercadolibre.manage", "org"],
      ["mercadolibre.invoice", "org"],
    ]);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: null,
        sales_channel: "MERCADO_LIBRE",
        fiscal_receiver_snapshot: receiver,
        apply_to_receivable: false,
        applied_to_receivable_amount: 0,
        amount: 60.5,
        commercial_snapshot: expect.objectContaining({
          stock_effect: "NONE",
          currency: "ARS",
          fiscal_preview: expect.objectContaining({
            DocTipo: 96,
            DocNro: 12_345_678,
            ImpTotal: 60.5,
            ImpNeto: 50,
            ImpIVA: 10.5,
          }),
        }),
      })
    );
    expect(
      mocks.from.mock.calls.every(([table]) => table === "credit_notes")
    ).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("recovers the original note after a lost confirmation response", async () => {
    await createMeliCreditNote("org", input);
    const saved = mocks.insert.mock.calls[0][0];
    mocks.replay.mockResolvedValue({
      data: {
        id: "note",
        created_by: "actor",
        sales_order_id: saleId,
        commercial_snapshot: saved.commercial_snapshot,
      },
      error: null,
    });
    expect(await createMeliCreditNote("org", input)).toEqual({
      creditNoteId: "note",
      idempotent: true,
    });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await expect(
      createMeliCreditNote("org", { ...input, amount: 60.51 })
    ).rejects.toThrow("otra nota de crédito");
  });
  it("reconciles a concurrent unique-key or amount-guard conflict before reporting failure", async () => {
    mocks.single.mockImplementation(() => {
      const saved = mocks.insert.mock.calls[0][0];
      mocks.replay.mockResolvedValue({
        data: {
          id: "winner",
          created_by: "actor",
          sales_order_id: saleId,
          commercial_snapshot: saved.commercial_snapshot,
        },
        error: null,
      });
      return {
        data: null,
        error: { code: "P0001", message: "saldo disponible" },
      };
    });
    expect(await createMeliCreditNote("org", input)).toEqual({
      creditNoteId: "winner",
      idempotent: true,
    });
  });
  it("keeps confirmed database rollback editable when the aggregate credit limit is exceeded", async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "El importe supera el saldo disponible",
      },
    });
    await expect(createMeliCreditNote("org", input)).rejects.toMatchObject({
      canEdit: true,
    });
  });
  it("denies an operator without fiscal permission before reading the invoice", async () => {
    mocks.ensure.mockRejectedValue(new Error("Sin permiso"));
    await expect(createMeliCreditNote("org", input)).rejects.toThrow(
      "Sin permiso"
    );
    expect(mocks.source).not.toHaveBeenCalled();
  });
});
