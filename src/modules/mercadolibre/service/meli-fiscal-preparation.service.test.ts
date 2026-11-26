import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMeliFiscalPreparation,
  inspectMeliFiscalDispatch,
  prepareMeliFiscal,
} from "./meli-fiscal-preparation.service";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  enabled: vi.fn(),
  module: vi.fn(),
  auth: vi.fn(),
  org: vi.fn(),
  rpc: vi.fn(),
  snapshot: vi.fn(),
  recoverySnapshot: vi.fn(),
  accounts: vi.fn(),
  lookup: vi.fn(),
  history: vi.fn(),
  noteContext: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/accounting-server", () => ({
  listMeliAccountReferencesServer: mocks.accounts,
  findMeliPaymentJournalRequestServer: mocks.lookup,
  listMeliJournalEntriesByOriginServer: mocks.history,
}));
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
vi.mock("./meli-fiscal-accounting-history.service", () => ({
  getMeliFiscalAccountingSnapshot: mocks.snapshot,
  getMeliFiscalSnapshotForRecovery: mocks.recoverySnapshot,
}));
vi.mock("./meli-credit-note-read.service", () => ({
  getMeliCreditNoteContext: mocks.noteContext,
}));

const orgId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const saleId = "00000000-0000-4000-8000-000000000003";
const noteId = "00000000-0000-4000-8000-000000000004";
const requestKey = "00000000-0000-4000-8000-000000000005";
const preparationId = "00000000-0000-4000-8000-000000000006";
const attempt = { requestKey, expectedActorId: actorId };
const invoice = { type: "invoice", saleId };
const note = { type: "creditNote", saleId, creditNoteId: noteId };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockResolvedValue(true);
  mocks.auth.mockResolvedValue({ userId: actorId });
  mocks.org.mockResolvedValue({ id: orgId });
  mocks.snapshot.mockResolvedValue({});
  mocks.history.mockResolvedValue([]);
  mocks.noteContext.mockResolvedValue({ note: { sales_order_id: saleId } });
});

describe("Meli fiscal preparation", () => {
  it("checks accounting history when no fiscal dispatch exists", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    mocks.history.mockResolvedValueOnce([
      {
        id: preparationId,
        org_id: orgId,
        tipo_evento: "FACTURA_VENTA",
        referencia_id: saleId,
        referencia_tabla: "sales_orders",
        estado: "ACTIVO",
        idempotency_key: "external",
        anulado_por_id: null,
        fecha: "2026-11-23",
      },
    ]);
    await expect(inspectMeliFiscalDispatch("org", invoice)).resolves.toEqual({
      dispatchStatus: null,
      journalEntryId: null,
      historyIssues: [
        `Asiento ${preparationId} sin recibo fiscal identificado.`,
      ],
    });
    expect(mocks.history).toHaveBeenCalledWith({
      orgId,
      referenciaId: saleId,
      referenciaTabla: "sales_orders",
    });
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("surfaces an accounting history failure even if no dispatch exists", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    mocks.history.mockRejectedValueOnce(
      new Error("Contabilidad no disponible")
    );
    await expect(inspectMeliFiscalDispatch("org", note)).rejects.toThrow(
      "Contabilidad no disponible"
    );
    expect(mocks.history).toHaveBeenCalledWith({
      orgId,
      referenciaId: noteId,
      referenciaTabla: "credit_notes",
    });
  });

  it("does not inspect another sale's note when the dispatch is absent", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    mocks.noteContext.mockResolvedValueOnce({
      note: { sales_order_id: orgId },
    });
    await expect(inspectMeliFiscalDispatch("org", note)).rejects.toThrow(
      "no pertenece"
    );
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("prepares a validated note with scoped identity and stable key", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ preparation_id: preparationId, idempotent: false }],
      error: null,
    });
    await expect(prepareMeliFiscal("org", note, attempt)).resolves.toEqual({
      preparationId,
    });
    expect(mocks.snapshot).toHaveBeenCalledWith("org", note);
    expect(mocks.rpc).toHaveBeenCalledWith("prepare_meli_fiscal_accounting", {
      p_org_id: orgId,
      p_actor_id: actorId,
      p_sale_id: saleId,
      p_origin_type: "creditNote",
      p_origin_id: noteId,
      p_request_key: requestKey,
    });
  });

  it("does not prepare without an authorized fiscal source or permissions", async () => {
    mocks.snapshot.mockRejectedValueOnce(
      new Error("Comprobante no autorizado")
    );
    await expect(prepareMeliFiscal("org", invoice, attempt)).rejects.toThrow(
      "no autorizado"
    );
    mocks.ensure.mockRejectedValueOnce(new Error("Sin permiso"));
    await expect(getMeliFiscalPreparation("org", invoice)).rejects.toThrow(
      "Sin permiso"
    );
    await expect(
      prepareMeliFiscal("org", { ...invoice, forged: true }, attempt)
    ).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("recovers by source without exposing the key or snapshot", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          preparation_id: preparationId,
          request_key: requestKey,
          source_snapshot: { cae: "123" },
          created_by: actorId,
          created_at: "2026-11-23T12:00:00Z",
        },
      ],
      error: null,
    });
    await expect(getMeliFiscalPreparation("org", invoice)).resolves.toEqual({
      actorId,
      preparation: { preparationId },
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "get_meli_fiscal_accounting_preparation",
      {
        p_org_id: orgId,
        p_actor_id: actorId,
        p_sale_id: saleId,
        p_origin_type: "invoice",
        p_origin_id: saleId,
      }
    );
  });

  it("surfaces ambiguous responses and malformed recovery instead of claiming success", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("network"));
    await expect(prepareMeliFiscal("org", invoice, attempt)).rejects.toThrow(
      "misma clave"
    );
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(prepareMeliFiscal("org", invoice, attempt)).rejects.toThrow(
      "no es verificable"
    );
    mocks.rpc.mockResolvedValueOnce({ data: [{}], error: null });
    await expect(getMeliFiscalPreparation("org", invoice)).rejects.toThrow();
  });

  it("does not send a saved attempt under a different actor", async () => {
    await expect(
      prepareMeliFiscal("org", invoice, {
        ...attempt,
        expectedActorId: orgId,
      })
    ).rejects.toThrow("otro usuario");
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not access preparations when the accounting feature is disabled", async () => {
    mocks.enabled.mockResolvedValue(false);
    await expect(getMeliFiscalPreparation("org", invoice)).rejects.toThrow(
      "no está habilitada"
    );
    await expect(prepareMeliFiscal("org", invoice, attempt)).rejects.toThrow(
      "no está habilitada"
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("verifies a fiscal dispatch without confirming it or hiding uncertainty", async () => {
    const snapshot = {
      date: "2026-11-23",
      currency: "ARS",
      exchangeRate: 1,
      total: "100.00",
      net: "100.00",
      exempt: "0.00",
      nonTaxable: "0.00",
      vat: "0.00",
      otherTaxes: "0.00",
      vatItems: [],
      tributeItems: [],
    };
    const payload = {
      orgId,
      originType: "invoice",
      originId: saleId,
      componentKey: "fiscal",
      requestKey,
      date: "2026-11-23",
      description: "Factura",
      actorId,
      currency: "ARS",
      exchangeRate: "1",
      lines: [
        {
          accountId: orgId,
          side: "DEBE",
          originalAmount: "100",
          pesosAmount: "100",
        },
        {
          accountId: noteId,
          side: "HABER",
          originalAmount: "100",
          pesosAmount: "100",
        },
      ],
    };
    const row = {
      request_key: requestKey,
      request_payload: payload,
      dispatch_status: "UNCERTAIN",
      journal_entry_id: null,
      initiated_by: actorId,
      initiated_at: "2026-11-23T12:00:00Z",
      published_by: null,
      published_at: null,
    };
    mocks.recoverySnapshot.mockResolvedValue(snapshot);
    mocks.accounts.mockResolvedValue([
      { id: orgId, account_code: "AR_DEUDORES_VENTAS" },
      { id: noteId, account_code: "VENTAS" },
    ]);
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    mocks.lookup
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(preparationId);
    await expect(inspectMeliFiscalDispatch("org", invoice)).resolves.toEqual({
      dispatchStatus: "UNCERTAIN",
      journalEntryId: null,
      historyIssues: [],
    });
    await expect(inspectMeliFiscalDispatch("org", invoice)).resolves.toEqual({
      dispatchStatus: "UNCERTAIN",
      journalEntryId: preparationId,
      historyIssues: [
        "El recibo fiscal no aparece en la historia del comprobante.",
      ],
    });
    expect(mocks.lookup).toHaveBeenCalledWith(payload);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0][0]).toBe(
      "get_meli_fiscal_dispatch_for_recovery"
    );

    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          ...row,
          dispatch_status: "PUBLISHED",
          journal_entry_id: preparationId,
          published_by: actorId,
          published_at: "2026-11-23T12:00:00Z",
        },
      ],
      error: null,
    });
    mocks.lookup.mockResolvedValueOnce(null);
    await expect(inspectMeliFiscalDispatch("org", invoice)).rejects.toThrow(
      "no coincide"
    );
    mocks.rpc.mockResolvedValueOnce({
      data: [{ ...row, request_payload: { ...payload, originId: noteId } }],
      error: null,
    });
    await expect(inspectMeliFiscalDispatch("org", invoice)).rejects.toThrow(
      "auditoría"
    );
    expect(mocks.lookup).toHaveBeenCalledTimes(3);
  });

  it("verifies a note with inverse fiscal lines and rejects source changes", async () => {
    const payload = {
      orgId,
      originType: "creditNote",
      originId: noteId,
      componentKey: "fiscal",
      requestKey,
      date: "2026-11-23",
      description: "Nota",
      actorId,
      currency: "USD",
      exchangeRate: "1000",
      lines: [
        {
          accountId: orgId,
          side: "HABER",
          originalAmount: "20",
          pesosAmount: "20000",
        },
        {
          accountId: saleId,
          side: "DEBE",
          originalAmount: "20",
          pesosAmount: "20000",
        },
      ],
    };
    const row = {
      request_key: requestKey,
      request_payload: payload,
      dispatch_status: "PUBLISHED",
      journal_entry_id: preparationId,
      initiated_by: actorId,
      initiated_at: "2026-11-23T12:00:00Z",
      published_by: actorId,
      published_at: "2026-11-23T12:01:00Z",
    };
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    mocks.accounts.mockResolvedValue([
      { id: orgId, account_code: "AR_DEUDORES_VENTAS" },
      { id: saleId, account_code: "VENTAS" },
    ]);
    const snapshot = {
      date: "2026-11-23",
      currency: "USD",
      exchangeRate: 1000,
      total: "20.00",
      net: "20.00",
      exempt: "0.00",
      nonTaxable: "0.00",
      vat: "0.00",
      otherTaxes: "0.00",
      vatItems: [],
      tributeItems: [],
    };
    mocks.recoverySnapshot
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({ ...snapshot, exchangeRate: 999 });
    mocks.lookup.mockResolvedValue(preparationId);
    mocks.history.mockResolvedValueOnce([
      {
        id: preparationId,
        org_id: orgId,
        tipo_evento: "MELI_NOTA_CREDITO",
        referencia_id: noteId,
        referencia_tabla: "credit_notes",
        estado: "ACTIVO",
        idempotency_key: "fiscal",
        anulado_por_id: null,
        fecha: "2026-11-23",
      },
    ]);
    await expect(inspectMeliFiscalDispatch("org", note)).resolves.toEqual({
      dispatchStatus: "PUBLISHED",
      journalEntryId: preparationId,
      historyIssues: [],
    });
    expect(mocks.history).toHaveBeenCalledWith({
      orgId,
      referenciaId: noteId,
      referenciaTabla: "credit_notes",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "get_meli_fiscal_dispatch_for_recovery",
      {
        p_org_id: orgId,
        p_actor_id: actorId,
        p_sale_id: saleId,
        p_origin_type: "creditNote",
        p_origin_id: noteId,
      }
    );
    await expect(inspectMeliFiscalDispatch("org", note)).rejects.toThrow(
      "cotización"
    );
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it("distinguishes no dispatch from errors and rejects unauthorised reads", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(inspectMeliFiscalDispatch("org", invoice)).resolves.toEqual({
      dispatchStatus: null,
      journalEntryId: null,
      historyIssues: [],
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "base inaccesible" },
    });
    await expect(inspectMeliFiscalDispatch("org", invoice)).rejects.toThrow(
      "base inaccesible"
    );
    mocks.ensure.mockRejectedValueOnce(new Error("Sin permiso"));
    await expect(inspectMeliFiscalDispatch("org", invoice)).rejects.toThrow(
      "Sin permiso"
    );
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
