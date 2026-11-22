import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMeliFiscalAccountingSnapshot,
  listMeliFiscalJournalEntries,
} from "./meli-fiscal-accounting-history.service";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  enabled: vi.fn(),
  sale: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  journalEntries: vi.fn(),
  fiscalSale: vi.fn(),
  fiscalNote: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/modules/accounting/service/accounting-integration.service", () => ({
  isMeliAccountingIntegrationEnabled: mocks.enabled,
}));
vi.mock("./meli-read.service", () => ({ getMeliSale: mocks.sale }));
vi.mock("./meli-credit-note-read.service", () => ({
  getMeliCreditSource: mocks.fiscalSale,
  getMeliCreditNoteContext: mocks.fiscalNote,
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/accounting-server", () => ({
  listMeliJournalEntriesByOriginServer: mocks.journalEntries,
}));

const orgId = "00000000-0000-4000-8000-000000000001";
const saleId = "00000000-0000-4000-8000-000000000002";
const noteId = "00000000-0000-4000-8000-000000000003";
const invoice = { type: "invoice", saleId };
const note = { type: "creditNote", saleId, creditNoteId: noteId };

describe("Meli fiscal accounting history", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enabled.mockResolvedValue(true);
    mocks.sale.mockResolvedValue({ id: saleId, organizationId: orgId });
    mocks.journalEntries.mockResolvedValue([]);
    mocks.maybeSingle.mockResolvedValue({ data: { id: noteId }, error: null });
    const query = {
      select: () => query,
      eq: mocks.eq,
      maybeSingle: mocks.maybeSingle,
    };
    mocks.from.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
  });

  it("verifies access and requests the invoice history by sale and organization", async () => {
    await expect(listMeliFiscalJournalEntries("org", invoice)).resolves.toEqual(
      []
    );
    expect(mocks.ensure).toHaveBeenNthCalledWith(
      1,
      "mercadolibre.accounting.manage",
      "org"
    );
    expect(mocks.ensure).toHaveBeenNthCalledWith(
      2,
      ["mercadolibre.payments.read", "mercadolibre.payments.manage"],
      "org"
    );
    expect(mocks.sale).toHaveBeenCalledWith("org", saleId);
    expect(mocks.journalEntries).toHaveBeenCalledWith({
      orgId,
      referenciaId: saleId,
      referenciaTabla: "sales_orders",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("checks the note belongs to the authorized sale and tenant", async () => {
    await listMeliFiscalJournalEntries("org", note);
    expect(mocks.from).toHaveBeenCalledWith("credit_notes");
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", orgId);
    expect(mocks.eq).toHaveBeenCalledWith("sales_channel", "MERCADO_LIBRE");
    expect(mocks.eq).toHaveBeenCalledWith("sales_order_id", saleId);
    expect(mocks.eq).toHaveBeenCalledWith("id", noteId);
    expect(mocks.journalEntries).toHaveBeenCalledWith({
      orgId,
      referenciaId: noteId,
      referenciaTabla: "credit_notes",
    });
  });

  it("rejects malformed, unauthorized, disabled and inaccessible requests", async () => {
    await expect(
      listMeliFiscalJournalEntries("org", { ...invoice, forged: true })
    ).rejects.toThrow();
    expect(mocks.ensure).not.toHaveBeenCalled();

    mocks.ensure.mockRejectedValueOnce(new Error("Sin permiso"));
    await expect(listMeliFiscalJournalEntries("org", invoice)).rejects.toThrow(
      "Sin permiso"
    );
    mocks.enabled.mockResolvedValueOnce(false);
    await expect(listMeliFiscalJournalEntries("org", invoice)).rejects.toThrow(
      "no está habilitada"
    );
    mocks.sale.mockResolvedValueOnce(null);
    await expect(listMeliFiscalJournalEntries("org", note)).rejects.toThrow(
      "fuera de tus depósitos"
    );
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.journalEntries).not.toHaveBeenCalled();
  });

  it("does not query accounting when the note cannot be verified", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(listMeliFiscalJournalEntries("org", note)).rejects.toThrow(
      "no pertenece"
    );
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "database error" },
    });
    await expect(listMeliFiscalJournalEntries("org", note)).rejects.toThrow(
      "No se pudo verificar"
    );
    expect(mocks.journalEntries).not.toHaveBeenCalled();
  });

  it("propagates accounting service failures rather than returning an empty history", async () => {
    mocks.journalEntries.mockRejectedValueOnce(new Error("Servicio caído"));
    await expect(listMeliFiscalJournalEntries("org", invoice)).rejects.toThrow(
      "Servicio caído"
    );
  });

  it("only loads an authorized and scoped fiscal snapshot", async () => {
    const request = {
      wsfeRequest: {
        CbteFch: 20_261_121,
        PtoVta: 1,
        CbteTipo: 1,
        CbteDesde: 42,
        CbteHasta: 42,
        MonId: "PES",
        MonCotiz: 1,
        ImpTotal: 100,
        ImpTotConc: 0,
        ImpNeto: 100,
        ImpOpEx: 0,
        ImpIVA: 0,
        ImpTrib: 0,
      },
    };
    const fiscalSale = {
      currency: "ARS",
      total_amount: 100,
      arca_status: "authorized",
      arca_cae: "123",
      arca_point_of_sale: 1,
      arca_voucher_type_code: 1,
      arca_voucher_number: 42,
      arca_request_json: request,
    };
    mocks.fiscalSale.mockResolvedValueOnce({ sale: fiscalSale });
    expect(await getMeliFiscalAccountingSnapshot("org", invoice)).toMatchObject(
      {
        date: "2026-11-21",
        net: "100.00",
      }
    );
    expect(mocks.fiscalSale).toHaveBeenCalledWith("org", saleId);
    mocks.fiscalNote.mockResolvedValueOnce({
      sale: fiscalSale,
      note: {
        ...fiscalSale,
        sales_order_id: saleId,
        amount: 100,
      },
    });
    expect(await getMeliFiscalAccountingSnapshot("org", note)).toMatchObject({
      total: "100.00",
    });
    expect(mocks.fiscalNote).toHaveBeenCalledWith("org", noteId);
  });

  it("rejects cross-sale notes and disabled snapshots", async () => {
    mocks.enabled.mockResolvedValueOnce(false);
    await expect(
      getMeliFiscalAccountingSnapshot("org", invoice)
    ).rejects.toThrow("no está habilitada");
    expect(mocks.fiscalSale).not.toHaveBeenCalled();
    mocks.fiscalNote.mockResolvedValueOnce({
      sale: {},
      note: { sales_order_id: orgId },
    });
    await expect(getMeliFiscalAccountingSnapshot("org", note)).rejects.toThrow(
      "no pertenece"
    );
  });
});
