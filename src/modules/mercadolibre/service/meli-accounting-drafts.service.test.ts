import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeliConfirmationError } from "../errors";
import {
  listMeliAccountingDrafts,
  listMeliPaymentJournalEntries,
  saveMeliAccountingDraft,
} from "./meli-accounting-drafts.service";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  module: vi.fn(),
  auth: vi.fn(),
  org: vi.fn(),
  rpc: vi.fn(),
  journalEntries: vi.fn(),
}));
vi.mock("server-only", () => ({}));
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
vi.mock("@/lib/accounting-server", () => ({
  listMeliJournalEntriesByOriginServer: mocks.journalEntries,
}));

const orgId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const paymentId = "00000000-0000-4000-8000-000000000003";
const key = "00000000-0000-4000-8000-000000000004";
const draftId = "00000000-0000-4000-8000-000000000005";
const input = {
  paymentId,
  idempotencyKey: key,
  expectedVersion: 0,
  breakdown: { net: "80", discount: "5", commission: "10", shipping: "5" },
  evidence: " comprobante ",
};

describe("Meli accounting drafts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: actorId });
    mocks.org.mockResolvedValue({ id: orgId });
    mocks.rpc.mockResolvedValue({
      data: [{ draft_id: draftId, version: 1, idempotent: false }],
      error: null,
    });
  });

  it("checks accounting, collection and module access before saving", async () => {
    expect(await saveMeliAccountingDraft("org", input)).toEqual({
      draft_id: draftId,
      version: 1,
      idempotent: false,
    });
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
    expect(mocks.module).toHaveBeenCalledWith("org", "pos");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_meli_accounting_breakdown_draft",
      {
        p_org_id: orgId,
        p_actor_id: actorId,
        p_payment_id: paymentId,
        p_idempotency_key: key,
        p_expected_version: 0,
        p_breakdown: input.breakdown,
        p_evidence: "comprobante",
      }
    );
  });

  it("never permits forged actor or malformed amounts", async () => {
    await expect(
      saveMeliAccountingDraft("org", { ...input, actorId })
    ).rejects.toThrow();
    await expect(
      saveMeliAccountingDraft("org", {
        ...input,
        breakdown: { ...input.breakdown, net: "80.001" },
      })
    ).rejects.toThrow();
    await expect(
      saveMeliAccountingDraft("org", { ...input, expectedVersion: -1 })
    ).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not call the database when accounting access is denied", async () => {
    mocks.ensure.mockRejectedValueOnce(new Error("Sin permiso contable"));
    await expect(saveMeliAccountingDraft("org", input)).rejects.toThrow(
      "Sin permiso contable"
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("distinguishes known rollbacks from uncertain or malformed responses", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "40001", message: "El desglose cambió" },
    });
    await expect(saveMeliAccountingDraft("org", input)).rejects.toMatchObject({
      message: "El desglose cambió",
      canEdit: true,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "22023", message: "El desglose no cuadra" },
    });
    await expect(saveMeliAccountingDraft("org", input)).rejects.toMatchObject({
      message: "El desglose no cuadra",
      canEdit: true,
    });
    mocks.rpc.mockRejectedValueOnce(new Error("network"));
    await expect(saveMeliAccountingDraft("org", input)).rejects.toMatchObject({
      canEdit: false,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "UNKNOWN", message: "timeout" },
    });
    await expect(saveMeliAccountingDraft("org", input)).rejects.toMatchObject({
      canEdit: false,
    });
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(saveMeliAccountingDraft("org", input)).rejects.toBeInstanceOf(
      MeliConfirmationError
    );
  });

  it("retrieves scoped draft history without changing monetary precision", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          id: draftId,
          version: 1,
          active: true,
          request_payload: { breakdown: input.breakdown, evidence: "" },
          gross_amount: "100.00",
          currency: "ARS",
          payment_date: "2026-11-21",
          created_by: actorId,
          created_at: "2026-11-21T12:00:00+00:00",
        },
      ],
      error: null,
    });
    expect(await listMeliAccountingDrafts("org", paymentId)).toMatchObject([
      { id: draftId, gross_amount: "100.00" },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_meli_accounting_breakdown_drafts",
      { p_org_id: orgId, p_actor_id: actorId, p_payment_id: paymentId }
    );
  });

  it("surfaces read failures instead of returning an empty history", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Sin acceso" },
    });
    await expect(listMeliAccountingDrafts("org", paymentId)).rejects.toThrow(
      "Sin acceso"
    );
  });

  it("verifies the scoped payment and permissions before reading the ledger", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    mocks.journalEntries.mockResolvedValueOnce([]);
    await expect(
      listMeliPaymentJournalEntries("org", paymentId)
    ).resolves.toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_meli_accounting_breakdown_drafts",
      { p_org_id: orgId, p_actor_id: actorId, p_payment_id: paymentId }
    );
    expect(mocks.journalEntries).toHaveBeenCalledWith({
      orgId,
      referenciaId: paymentId,
      referenciaTabla: "mercadolibre_payments",
    });
  });

  it("never queries the ledger when the payment is inaccessible or malformed", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Sin acceso al depósito" },
    });
    await expect(
      listMeliPaymentJournalEntries("org", paymentId)
    ).rejects.toThrow("Sin acceso al depósito");
    expect(mocks.journalEntries).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      listMeliPaymentJournalEntries("org", paymentId)
    ).rejects.toThrow();
    expect(mocks.journalEntries).not.toHaveBeenCalled();
  });

  it("surfaces ledger failures instead of declaring the payment unaccounted", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    mocks.journalEntries.mockRejectedValueOnce(new Error("Servicio caído"));
    await expect(
      listMeliPaymentJournalEntries("org", paymentId)
    ).rejects.toThrow("Servicio caído");
  });
});
