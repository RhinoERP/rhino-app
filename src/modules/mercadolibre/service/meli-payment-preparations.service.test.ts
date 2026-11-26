import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelMeliPaymentPreparation,
  getMeliPaymentDispatchForRecovery,
  inspectMeliPaymentDispatch,
  inspectMeliPaymentReversals,
  listMeliPaymentPreparations,
  prepareMeliPayment,
} from "./meli-payment-preparations.service";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  module: vi.fn(),
  auth: vi.fn(),
  org: vi.fn(),
  rpc: vi.fn(),
  findJournal: vi.fn(),
  findReversal: vi.fn(),
  history: vi.fn(),
  accounts: vi.fn(),
  fiscal: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/accounting-server", () => ({
  findMeliPaymentJournalRequestServer: mocks.findJournal,
  inspectMeliPaymentReversalSourceServer: mocks.findReversal,
  listMeliJournalEntriesByOriginServer: mocks.history,
  listMeliAccountReferencesServer: mocks.accounts,
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/modules/organizations/service/module-access.service", () => ({
  guardOrganizationModuleAccess: mocks.module,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.org,
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("./meli-fiscal-accounting-history.service", () => ({
  getMeliInvoiceFiscalSnapshotForRecovery: mocks.fiscal,
}));

const orgId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const paymentId = "00000000-0000-4000-8000-000000000003";
const draftId = "00000000-0000-4000-8000-000000000004";
const requestKey = "00000000-0000-4000-8000-000000000005";
const preparationId = "00000000-0000-4000-8000-000000000006";
const attempt = { paymentId, draftId, requestKey, expectedActorId: actorId };

describe("Meli payment preparations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: actorId });
    mocks.org.mockResolvedValue({ id: orgId });
    mocks.fiscal.mockResolvedValue({ currency: "ARS", exchangeRate: 1 });
    mocks.history.mockResolvedValue([]);
  });

  it("checks permissions and reads scoped preparations without a feature flag", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(
      listMeliPaymentPreparations("org", paymentId)
    ).resolves.toEqual([]);
    expect(mocks.ensure).toHaveBeenNthCalledWith(
      1,
      "mercadolibre.accounting.manage",
      "org"
    );
    expect(mocks.module).toHaveBeenCalledWith("org", "pos");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_meli_payment_accounting_preparations",
      {
        p_org_id: orgId,
        p_actor_id: actorId,
        p_payment_id: paymentId,
      }
    );
  });

  it("recovers reversals without confirming them and rejects missing confirmed receipts", async () => {
    const reservation = {
      reservation_id: draftId,
      preparation_id: preparationId,
      request_key: requestKey,
      reversal_date: "2026-11-23",
      reason: "Carga errónea",
      reversal_description: "Reversión cobro Meli: Carga errónea",
      created_by: actorId,
      created_at: "2026-11-23T12:00:00Z",
      status: "RESERVED" as "RESERVED" | "FINALIZING" | "VOIDED",
      payment_status: "RECORDED" as "RECORDED" | "VOIDED",
      finalized_by: null as string | null,
      finalized_at: null as string | null,
      components: [
        {
          componentKey: "net",
          originalEntryId: draftId,
          requestKey,
          reversalEntryId: null as string | null,
          confirmedBy: null as string | null,
          confirmedAt: null as string | null,
        },
      ],
    };
    const preparation = {
      id: preparationId,
      draft_id: draftId,
      status: "PREPARED",
      created_by: actorId,
      created_at: "2026-11-23T12:00:00Z",
      cancelled_by: null,
      cancelled_at: null,
      components: [
        {
          key: "net",
          description: "Neto",
          amount: "100",
          dispatchStatus: "PUBLISHED",
          journalEntryId: draftId,
        },
      ],
    };
    const request = {
      orgId,
      originType: "payment",
      originId: paymentId,
      componentKey: "net",
      requestKey,
      date: "2026-11-23",
      description: "Cobro",
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
          accountId: actorId,
          side: "HABER",
          originalAmount: "100",
          pesosAmount: "100",
        },
      ],
    };
    const originalDispatch = {
      request_key: requestKey,
      request_payload: request,
      dispatch_status: "PUBLISHED",
      journal_entry_id: draftId,
      initiated_by: actorId,
      initiated_at: "2026-11-23T12:00:00Z",
      published_by: actorId,
      published_at: "2026-11-23T12:00:00Z",
    };
    let sourceAmount = "100";
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_meli_payment_reversal_reservation") {
        return { data: [reservation], error: null };
      }
      if (name === "get_meli_payment_dispatch_for_recovery") {
        return { data: [originalDispatch], error: null };
      }
      if (name === "get_meli_payment_dispatch_source") {
        return {
          data: [
            {
              sale_id: draftId,
              payment_date: "2026-11-23",
              currency: "ARS",
              payment_status: reservation.payment_status,
              preparation_status: "PREPARED",
              component_amount: sourceAmount,
              debit_account: { kind: "manual", id: orgId },
              credit_account: { kind: "manual", id: actorId },
            },
          ],
          error: null,
        };
      }
      return { data: [preparation], error: null };
    });
    mocks.accounts.mockResolvedValue([
      { id: orgId, account_code: null },
      { id: actorId, account_code: null },
    ]);
    mocks.findReversal
      .mockResolvedValueOnce({
        originalEntryId: draftId,
        reversalEntryId: null,
      })
      .mockResolvedValueOnce({
        originalEntryId: draftId,
        reversalEntryId: paymentId,
      });
    await expect(
      inspectMeliPaymentReversals("org", paymentId)
    ).resolves.toEqual({
      date: "2026-11-23",
      status: "RESERVED",
      historyIssues: ["net: el asiento original no aparece en la historia."],
      components: [
        {
          key: "net",
          description: "Neto",
          reversalEntryId: null,
          confirmed: false,
        },
      ],
    });
    const originalEntry = {
      id: draftId,
      org_id: orgId,
      tipo_evento: "MELI_COBRO",
      referencia_id: paymentId,
      referencia_tabla: "mercadolibre_payments",
      estado: "ACTIVO",
      idempotency_key: "original",
      anulado_por_id: null,
      fecha: "2026-11-23",
    };
    const reversalEntry = {
      ...originalEntry,
      id: paymentId,
      tipo_evento: "CONTRA_ASIENTO",
      referencia_tabla: "accounting.journal_entries",
      referencia_id: draftId,
    };
    mocks.findReversal.mockResolvedValueOnce({
      originalEntryId: draftId,
      reversalEntryId: paymentId,
    });
    mocks.history.mockResolvedValueOnce([originalEntry, reversalEntry]);
    await expect(
      inspectMeliPaymentReversals("org", paymentId)
    ).resolves.toMatchObject({ historyIssues: [] });
    expect(mocks.history).toHaveBeenCalledWith({
      orgId,
      referenciaId: paymentId,
      referenciaTabla: "mercadolibre_payments",
    });
    mocks.findReversal.mockResolvedValueOnce({
      originalEntryId: draftId,
      reversalEntryId: paymentId,
    });
    mocks.history.mockRejectedValueOnce(
      new Error("Contabilidad no disponible")
    );
    await expect(inspectMeliPaymentReversals("org", paymentId)).rejects.toThrow(
      "Contabilidad no disponible"
    );
    await expect(
      inspectMeliPaymentReversals("org", paymentId)
    ).resolves.toEqual({
      date: "2026-11-23",
      status: "RESERVED",
      historyIssues: [
        "net: el asiento original no aparece en la historia.",
        "net: el contra-asiento no aparece en la historia.",
      ],
      components: [
        {
          key: "net",
          description: "Neto",
          reversalEntryId: paymentId,
          confirmed: false,
        },
      ],
    });
    expect(mocks.findReversal).toHaveBeenCalledWith({
      original: request,
      reversal: {
        orgId,
        originalEntryId: draftId,
        requestKey,
        date: "2026-11-23",
        description: reservation.reversal_description,
        actorId,
      },
    });
    reservation.components[0].reversalEntryId = paymentId;
    reservation.components[0].confirmedBy = actorId;
    reservation.components[0].confirmedAt = "2026-11-23T12:01:00Z";
    mocks.findReversal.mockResolvedValueOnce({
      originalEntryId: draftId,
      reversalEntryId: null,
    });
    await expect(inspectMeliPaymentReversals("org", paymentId)).rejects.toThrow(
      "no coincide con Contabilidad"
    );
    reservation.status = "VOIDED";
    reservation.finalized_by = actorId;
    reservation.finalized_at = "2026-11-23T12:02:00Z";
    await expect(inspectMeliPaymentReversals("org", paymentId)).rejects.toThrow(
      "estado de la reserva"
    );
    reservation.payment_status = "VOIDED";
    mocks.findReversal.mockResolvedValueOnce({
      originalEntryId: draftId,
      reversalEntryId: paymentId,
    });
    await expect(
      inspectMeliPaymentReversals("org", paymentId)
    ).resolves.toMatchObject({
      status: "VOIDED",
      components: [{ reversalEntryId: paymentId, confirmed: true }],
    });
    sourceAmount = "99";
    await expect(inspectMeliPaymentReversals("org", paymentId)).rejects.toThrow(
      "no coincide con el componente"
    );
    sourceAmount = "100";
    reservation.finalized_at = null;
    await expect(inspectMeliPaymentReversals("org", paymentId)).rejects.toThrow(
      "estado de la reserva"
    );
    reservation.status = "RESERVED";
    reservation.payment_status = "RECORDED";
    reservation.finalized_by = null;
    preparation.components[0].journalEntryId = paymentId;
    await expect(inspectMeliPaymentReversals("org", paymentId)).rejects.toThrow(
      "no coincide con su envío"
    );
    expect(mocks.findReversal).toHaveBeenCalledTimes(6);
  });

  it("keeps no reversal separate from permission and RPC failures", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      inspectMeliPaymentReversals("org", paymentId)
    ).resolves.toBeNull();
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Sin conexión" },
    });
    await expect(inspectMeliPaymentReversals("org", paymentId)).rejects.toThrow(
      "Sin conexión"
    );
    mocks.ensure.mockRejectedValueOnce(new Error("Sin permiso"));
    await expect(inspectMeliPaymentReversals("org", paymentId)).rejects.toThrow(
      "Sin permiso"
    );
    expect(mocks.findReversal).not.toHaveBeenCalled();
  });

  it("prepares with an immutable request key and validates the result", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          preparation_id: preparationId,
          preparation_status: "PREPARED",
          idempotent: false,
        },
      ],
      error: null,
    });
    await expect(prepareMeliPayment("org", attempt)).resolves.toMatchObject({
      preparation_id: preparationId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("prepare_meli_accounting_payment", {
      p_org_id: orgId,
      p_actor_id: actorId,
      p_payment_id: paymentId,
      p_draft_id: draftId,
      p_idempotency_key: requestKey,
    });
  });

  it("distinguishes known rollback and uncertain response", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("network"));
    await expect(prepareMeliPayment("org", attempt)).rejects.toMatchObject({
      canEdit: false,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "22023", message: "inválido" },
    });
    await expect(prepareMeliPayment("org", attempt)).rejects.toMatchObject({
      canEdit: true,
    });
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(prepareMeliPayment("org", attempt)).rejects.toMatchObject({
      canEdit: false,
    });
  });

  it("cancels idempotently and rejects a different returned identifier", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ preparation_id: preparationId, idempotent: true }],
      error: null,
    });
    await expect(
      cancelMeliPaymentPreparation("org", preparationId)
    ).resolves.toMatchObject({
      idempotent: true,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: [{ preparation_id: draftId, idempotent: false }],
      error: null,
    });
    await expect(
      cancelMeliPaymentPreparation("org", preparationId)
    ).rejects.toThrow("verificable");
  });

  it("does not call SQL with forged data or without permission", async () => {
    await expect(
      prepareMeliPayment("org", { ...attempt, actorId })
    ).rejects.toThrow();
    mocks.ensure.mockRejectedValueOnce(new Error("Sin permiso"));
    await expect(listMeliPaymentPreparations("org", paymentId)).rejects.toThrow(
      "Sin permiso"
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not submit a saved request as a different actor", async () => {
    await expect(
      prepareMeliPayment("org", { ...attempt, expectedActorId: orgId })
    ).rejects.toThrow("otro usuario");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not present an invalid dispatch receipt as a valid state", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: preparationId,
          draft_id: draftId,
          status: "PREPARED",
          created_by: actorId,
          created_at: "2026-11-23T12:00:00Z",
          cancelled_by: null,
          cancelled_at: null,
          components: [
            {
              key: "net",
              description: "Neto",
              amount: "80.00",
              dispatchStatus: "PUBLISHED",
              journalEntryId: null,
            },
          ],
        },
      ],
      error: null,
    });
    await expect(
      listMeliPaymentPreparations("org", paymentId)
    ).rejects.toThrow();
  });

  it("recovers the exact durable request without normalizing its payload", async () => {
    const request = {
      orgId,
      originType: "payment",
      originId: paymentId,
      componentKey: "net",
      requestKey,
      date: "2026-11-23",
      description: " Cobro Meli ",
      actorId,
      currency: "USD",
      exchangeRate: "1325.75",
      lines: [
        {
          accountId: draftId,
          side: "DEBE",
          originalAmount: "1.00",
          pesosAmount: "1325.75",
        },
        {
          accountId: preparationId,
          side: "HABER",
          originalAmount: "1.00",
          pesosAmount: "1325.75",
        },
      ],
    };
    const row = {
      request_key: requestKey,
      request_payload: request,
      dispatch_status: "UNCERTAIN",
      journal_entry_id: null,
      initiated_by: actorId,
      initiated_at: "2026-11-23T12:00:00Z",
      published_by: null,
      published_at: null,
    };
    mocks.rpc.mockResolvedValueOnce({ data: [row], error: null });
    await expect(
      getMeliPaymentDispatchForRecovery("org", {
        paymentId,
        preparationId,
        componentKey: "net",
      })
    ).resolves.toEqual(row);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "get_meli_payment_dispatch_for_recovery",
      {
        p_org_id: orgId,
        p_actor_id: actorId,
        p_payment_id: paymentId,
        p_preparation_id: preparationId,
        p_component_key: "net",
      }
    );
    mocks.rpc.mockResolvedValueOnce({
      data: [{ ...row, request_payload: { ...request, originId: draftId } }],
      error: null,
    });
    await expect(
      getMeliPaymentDispatchForRecovery("org", {
        paymentId,
        preparationId,
        componentKey: "net",
      })
    ).rejects.toThrow("no coincide");
    mocks.rpc.mockResolvedValueOnce({
      data: [{ ...row, journal_entry_id: draftId }],
      error: null,
    });
    await expect(
      getMeliPaymentDispatchForRecovery("org", {
        paymentId,
        preparationId,
        componentKey: "net",
      })
    ).rejects.toThrow("no coincide");
  });

  it("does not mistake an absent or failed recovery query for publication", async () => {
    const input = { paymentId, preparationId, componentKey: "net" };
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      getMeliPaymentDispatchForRecovery("org", input)
    ).resolves.toBeNull();
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "no disponible" },
    });
    await expect(
      getMeliPaymentDispatchForRecovery("org", input)
    ).rejects.toThrow("no disponible");
  });

  it("verifies the persisted payload without creating or confirming a dispatch", async () => {
    const request = {
      orgId,
      originType: "payment",
      originId: paymentId,
      componentKey: "net",
      requestKey,
      date: "2026-11-23",
      description: "Cobro",
      actorId,
      currency: "ARS",
      exchangeRate: "1",
      lines: [
        {
          accountId: draftId,
          side: "DEBE",
          originalAmount: "1",
          pesosAmount: "1",
        },
        {
          accountId: preparationId,
          side: "HABER",
          originalAmount: "1",
          pesosAmount: "1",
        },
      ],
    };
    const row = {
      request_key: requestKey,
      request_payload: request,
      dispatch_status: "UNCERTAIN",
      journal_entry_id: null,
      initiated_by: actorId,
      initiated_at: "2026-11-23T12:00:00Z",
      published_by: null,
      published_at: null,
    };
    const input = { paymentId, preparationId, componentKey: "net" };
    const source = {
      sale_id: paymentId,
      payment_date: "2026-11-23",
      currency: "ARS",
      payment_status: "RECORDED",
      preparation_status: "PREPARED",
      component_amount: "1.00",
      debit_account: { kind: "semantic", code: "MERCADO_PAGO" },
      credit_account: { kind: "manual", id: preparationId },
    };
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: [name === "get_meli_payment_dispatch_source" ? source : row],
      error: null,
    }));
    mocks.accounts.mockResolvedValue([
      { id: draftId, account_code: "MERCADO_PAGO" },
      { id: preparationId, account_code: null },
    ]);
    mocks.findJournal
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(draftId);
    await expect(inspectMeliPaymentDispatch("org", input)).resolves.toEqual({
      dispatchStatus: "UNCERTAIN",
      journalEntryId: null,
    });
    await expect(inspectMeliPaymentDispatch("org", input)).resolves.toEqual({
      dispatchStatus: "UNCERTAIN",
      journalEntryId: draftId,
    });
    expect(mocks.findJournal).toHaveBeenCalledWith(request);
    expect(mocks.fiscal).toHaveBeenCalledWith("org", source.sale_id);
    expect(mocks.rpc).toHaveBeenCalledTimes(4);
    expect(
      mocks.rpc.mock.calls.every(
        ([name]) =>
          name === "get_meli_payment_dispatch_for_recovery" ||
          name === "get_meli_payment_dispatch_source"
      )
    ).toBe(true);

    mocks.fiscal.mockResolvedValueOnce({ currency: "USD", exchangeRate: 1000 });
    await expect(inspectMeliPaymentDispatch("org", input)).rejects.toThrow(
      "moneda"
    );
    expect(mocks.findJournal).toHaveBeenCalledTimes(2);

    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          ...row,
          dispatch_status: "PUBLISHED",
          journal_entry_id: draftId,
          published_by: actorId,
          published_at: "2026-11-23T12:01:00Z",
        },
      ],
      error: null,
    });
    mocks.findJournal.mockResolvedValueOnce(preparationId);
    await expect(inspectMeliPaymentDispatch("org", input)).rejects.toThrow(
      "no coincide"
    );
  });
});
