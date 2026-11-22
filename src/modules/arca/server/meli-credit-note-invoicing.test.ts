import { beforeEach, describe, expect, it, vi } from "vitest";
import { readMeliAccountingFiscalSnapshot } from "@/modules/mercadolibre/utils/accounting-fiscal-snapshot";
import {
  emitCreditNote,
  reconcileMeliCreditNote,
} from "./credit-note-invoicing.service";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  ensure: vi.fn(),
  normal: vi.fn(),
  admin: vi.fn(),
  credentials: vi.fn(),
  authorize: vi.fn(),
  info: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/mercadolibre/service/meli-credit-note-read.service", () => ({
  getMeliCreditNoteContext: mocks.context,
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.normal }));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: mocks.admin,
}));
vi.mock("./access", () => ({
  assertCanIssueOrganizationArca: vi.fn(),
  getCurrentUserOrganizationArcaAccess: async () => ({
    organization: { id: "org", cuit: "30711833397" },
  }),
}));
vi.mock("./client-factory", () => ({
  resolveArcaOrganizationCredentials: mocks.credentials,
  isArcaCertificateExpired: () => false,
  createArcaClientFromCredentials: () => ({
    ElectronicBilling: {
      createNextVoucher: mocks.authorize,
      createVoucher: mocks.authorize,
      getLastVoucher: async () => 7,
      getVoucherInfo: mocks.info,
    },
  }),
}));

let note: Record<string, unknown>;
const params = {
  orgSlug: "org",
  creditNoteId: "note",
  salesChannel: "MERCADO_LIBRE" as const,
};
describe("Meli through the shared NC fiscal engine", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    note = {
      id: "note",
      organization_id: "org",
      sales_order_id: "sale",
      customer_id: null,
      issue_date: "2026-11-16",
      amount: 60.5,
      invoice_type: "FACTURA_B",
      status: "CONFIRMED",
      is_historical: false,
      arca_status: "not_requested",
    };
    mocks.context.mockImplementation(async () => ({
      note,
      receiver: {
        version: 1,
        tax_condition: "CONSUMIDOR_FINAL",
        document_type: "DNI",
        document_number: "12345678",
        first_name: "Ana",
        last_name: "Pérez",
        address: "Calle 1",
      },
      sale: {
        id: "sale",
        status: "DELIVERED",
        sale_date: "2026-11-15",
        invoice_type: "FACTURA_B",
        total_amount: 121,
        arca_status: "authorized",
        arca_cae: "source-cae",
        arca_point_of_sale: 2,
        arca_voucher_number: 7,
        arca_voucher_type_code: 6,
        arca_request_json: null,
        taxes: [
          {
            id: "vat",
            tax_id: "vat",
            name: "IVA",
            rate: 21,
            base_amount: 100,
            tax_amount: 21,
            tax_code_snapshot: "IVA_21",
          },
        ],
      },
    }));
    mocks.credentials.mockResolvedValue({
      pointOfSale: 2,
      cert: "cert",
      key: "key",
      environment: "dev",
      settings: { status: "connected" },
    });
    mocks.authorize.mockResolvedValue({
      CAE: "86462382117559",
      CAEFchVto: "2026-11-25",
      voucherNumber: 8,
    });
    mocks.info.mockResolvedValue(null);
    mocks.admin.mockImplementation(() => ({
      from: () => {
        const query = Object.assign(
          Promise.resolve({ data: note, error: null }),
          {
            update: (patch: Record<string, unknown>) => {
              note = { ...note, ...patch };
              return query;
            },
            select: () => query,
            in: () => query,
            eq: (key: string, value: unknown) => {
              mocks.eq(key, value);
              return query;
            },
            maybeSingle: async () => ({ data: note, error: null }),
            single: async () => ({ data: note, error: null }),
          }
        );
        return query;
      },
    }));
  });
  it("emits a proportional B credit to the original DNI without wholesale or accounting access", async () => {
    const result = await emitCreditNote(params);
    expect(result.status).toBe("authorized");
    expect(
      readMeliAccountingFiscalSnapshot({
        status: "authorized",
        cae: "86462382117559",
        currency: "ARS",
        amount: 60.5,
        pointOfSale: 2,
        voucherType: 8,
        voucherNumber: 8,
        request: note.arca_request_json,
      })
    ).toMatchObject({ net: "50.00", vat: "10.50", total: "60.50" });
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        CbteTipo: 8,
        DocTipo: 96,
        DocNro: 12_345_678,
        CbteFch: 20_261_116,
        ImpTotal: 60.5,
        ImpNeto: 50,
        ImpIVA: 10.5,
        CbtesAsoc: [{ Tipo: 6, PtoVta: 2, Nro: 7, CbteFch: 20_261_115 }],
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith("sales_channel", "MERCADO_LIBRE");
    expect(mocks.normal).not.toHaveBeenCalled();
  });
  it("recovers an uncertain reserved NC without authorizing it a second time", async () => {
    mocks.authorize.mockRejectedValueOnce(new Error("connection lost"));
    await expect(emitCreditNote(params)).rejects.toThrow("connection lost");
    expect(note.arca_status).toBe("pending");
    const request = mocks.authorize.mock.calls[0][0];
    mocks.info.mockResolvedValue({
      ...request,
      Resultado: "A",
      CodAutorizacion: "86462382117559",
      FchVto: "20261125",
      Iva: { AlicIva: request.Iva },
      CbtesAsoc: { CbteAsoc: request.CbtesAsoc },
    });
    const result = await reconcileMeliCreditNote("org", "note");
    expect(result.status).toBe("authorized");
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.info).toHaveBeenCalledWith(8, 2, 8);
    expect(mocks.normal).not.toHaveBeenCalled();
  });
  it("returns an existing authorization without sending another voucher", async () => {
    note.arca_status = "authorized";
    expect((await emitCreditNote(params)).idempotent).toBe(true);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("blocks pending emissions before resolving credentials", async () => {
    note.arca_status = "pending";
    await expect(emitCreditNote(params)).rejects.toThrow(
      "emisión fiscal en curso"
    );
    expect(mocks.credentials).not.toHaveBeenCalled();
  });
  it("preserves transport uncertainty as pending", async () => {
    mocks.authorize.mockRejectedValue(new Error("timeout"));
    await expect(emitCreditNote(params)).rejects.toThrow("timeout");
    expect(note.arca_status).toBe("pending");
  });
  it("does not load notes when the user has no Meli invoice permission", async () => {
    mocks.ensure.mockRejectedValue(new Error("Sin permiso"));
    await expect(emitCreditNote(params)).rejects.toThrow("Sin permiso");
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
