import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateMeliCreditNoteHtml } from "./meli-credit-note-pdf.service";

const mocks = vi.hoisted(() => ({ context: vi.fn(), render: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./meli-credit-note-read.service", () => ({
  getMeliCreditNoteContext: mocks.context,
}));
vi.mock("@/modules/arca/server/repository", () => ({
  getOrganizationArcaSettingsByOrganizationId: async () => null,
}));
vi.mock("@/modules/arca/server/html-to-pdf.service", () => ({
  paginateFiscalInvoiceHtml: async (html: string) => html,
}));
vi.mock("@/modules/credit-notes/service/credit-note-pdf.service", () => ({
  generateCreditNoteHTML: mocks.render,
}));

const request = {
  PtoVta: 2,
  CbteTipo: 8,
  DocTipo: 96,
  DocNro: 12_345_678,
  CbteFch: 20_261_116,
  ImpTotal: 60.5,
  ImpNeto: 50,
  ImpIVA: 10.5,
  ImpTrib: 0,
  ImpOpEx: 0,
  ImpTotConc: 0,
  MonId: "PES",
  MonCotiz: 1,
  Iva: [{ Id: 5, BaseImp: 50, Importe: 10.5 }],
};
let note: Record<string, unknown>;
describe("Meli credit note PDF snapshots", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.render.mockResolvedValue("fiscal-html");
    note = {
      id: "note",
      sales_order_id: "sale",
      credit_note_number: "NC-00005",
      customer_id: null,
      amount: 60.5,
      invoice_type: "FACTURA_B",
      arca_status: "authorized",
      arca_cae: "86462382117559",
      arca_point_of_sale: 2,
      arca_voucher_number: 8,
      arca_voucher_type_code: 8,
      arca_request_json: { wsfeRequest: request },
      arca_response_json: null,
      reason: "Bonificación",
    };
    mocks.context.mockImplementation(async () => ({
      note,
      organization: { id: "org", name: "Empresa", cuit: "30711833397" },
      sale: {
        sale_number: 1,
        invoice_number: "0002-00000007",
        currency: "ARS",
      },
      receiver: {
        version: 1,
        tax_condition: "CONSUMIDOR_FINAL",
        document_type: "DNI",
        document_number: "12345678",
        first_name: "Ana",
        last_name: "Pérez",
        address: "Calle 1",
      },
    }));
  });
  it("prints the receiver's DNI and the fiscal snapshot rather than current customer data", async () => {
    const result = await generateMeliCreditNoteHtml("org", "note");
    expect(result.html).toBe("fiscal-html");
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({
          cuit: null,
          document: { type: "DNI", number: "12345678" },
          businessName: "Ana Pérez",
        }),
        fiscalBreakdown: expect.objectContaining({
          netAmount: 50,
          totalAmount: 60.5,
        }),
        fiscal: expect.objectContaining({ currency: "PES", currencyRate: 1 }),
      })
    );
  });
  it("prefers the matching authorized ARCA breakdown over the submitted request", async () => {
    note.arca_response_json = {
      voucherInfo: {
        ...request,
        Resultado: "A",
        CbteDesde: 8,
        CodAutorizacion: "86462382117559",
        ImpNeto: 49.99,
        ImpIVA: 10.51,
        Iva: { AlicIva: [{ Id: 5, BaseImp: 49.99, Importe: 10.51 }] },
      },
    };
    await generateMeliCreditNoteHtml("org", "note");
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        fiscalBreakdown: expect.objectContaining({ netAmount: 49.99 }),
      })
    );
  });
  it("does not generate a fiscal PDF while the result is uncertain", async () => {
    note.arca_status = "pending";
    await expect(generateMeliCreditNoteHtml("org", "note")).rejects.toThrow(
      "todavía no está autorizada"
    );
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
