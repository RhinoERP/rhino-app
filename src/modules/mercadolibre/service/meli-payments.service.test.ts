import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMeliPayment,
  getMeliPaymentHistory,
  getMeliPaymentSale,
  listMeliPaymentSales,
  voidMeliPayment,
} from "./meli-payments.service";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  module: vi.fn(),
  auth: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  range: vi.fn(),
  source: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/modules/organizations/service/module-access.service", () => ({
  guardOrganizationModuleAccess: mocks.module,
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({
    id: "00000000-0000-4000-8000-000000000010",
  }),
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: mocks.admin,
}));

const saleId = "00000000-0000-4000-8000-000000000001";
const paymentId = "00000000-0000-4000-8000-000000000002";
const actorId = "00000000-0000-4000-8000-000000000003";
const orgId = "00000000-0000-4000-8000-000000000010";
const warehouseId = "00000000-0000-4000-8000-000000000011";
const receiver = {
  version: 1,
  tax_condition: "CONSUMIDOR_FINAL",
  document_type: "DNI",
  document_number: "12345678",
  first_name: "Ana",
  last_name: "Pérez",
  address: "Calle 1",
};
const input = {
  saleId,
  idempotencyKey: "00000000-0000-4000-8000-000000000004",
  amount: 60.5,
  currency: "ARS",
  paymentDate: "2026-11-17",
  referenceNumber: "00012345",
};
let head: Record<string, unknown>;

describe("Meli operational collection services", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    head = {
      sale_id: saleId,
      sale_number: 1,
      marketplace_order_number: "000123",
      sale_date: "2026-11-16",
      buyer_name: "Ana Pérez",
      fiscal_receiver_snapshot: receiver,
      currency: "ARS",
      total_amount: 121,
      collected_amount: 60.5,
      outstanding_amount: 60.5,
      collection_status: "PARTIAL",
      sale_status: "DELIVERED",
      arca_status: "error",
      invoice_number: null,
      warehouse_id: warehouseId,
      warehouse_name: "Meli",
      has_payment_history: true,
      total_count: 1,
    };
    mocks.auth.mockResolvedValue({ userId: actorId });
    mocks.admin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "commit_mercadolibre_payment") {
        return Promise.resolve({
          data: [
            {
              payment_id: paymentId,
              idempotent: false,
              payment_status: "RECORDED",
            },
          ],
          error: null,
        });
      }
      if (name === "void_mercadolibre_payment") {
        return Promise.resolve({
          data: [
            {
              payment_id: paymentId,
              idempotent: false,
              payment_status: "VOIDED",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [head], error: null });
    });
    const query = {
      select: () => query,
      order: () => query,
      eq: mocks.eq,
      range: mocks.range,
      maybeSingle: mocks.source,
    };
    mocks.from.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.source.mockResolvedValue({
      data: { sales_order_id: saleId },
      error: null,
    });
    mocks.range.mockResolvedValue({
      data: [
        {
          id: paymentId,
          amount: 60.5,
          currency: "ARS",
          payment_date: "2026-11-17",
          reference_number: "00012345",
          notes: "",
          status: "RECORDED",
          created_by: actorId,
          created_at: "2026-11-17T12:00:00Z",
          voided_by: null,
          voided_at: null,
          void_reason: null,
          fiscal_receiver_snapshot: receiver,
        },
      ],
      count: 1,
      error: null,
    });
  });
  it("loads gross collections without requiring a wholesale receivable, POS session or general Meli access", async () => {
    const result = await listMeliPaymentSales("org");
    expect(result.filters.view).toBe("PENDING");
    expect(result.data[0]).toMatchObject({
      buyerName: "Ana Pérez",
      status: "PARTIAL",
      collectedAmount: 60.5,
      canRegister: true,
    });
    expect(mocks.module).toHaveBeenCalledWith("org", "pos");
    expect(mocks.ensure).toHaveBeenCalledWith(
      ["mercadolibre.payments.read", "mercadolibre.payments.manage"],
      "org"
    );
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result.data[0]).not.toHaveProperty("fiscal_receiver_snapshot");
  });
  it("keeps payment eligibility independent from fiscal authorization and handles cancelled history as read-only", async () => {
    expect((await getMeliPaymentSale("org", saleId))?.canRegister).toBe(true);
    head.sale_status = "CANCELLED";
    expect((await getMeliPaymentSale("org", saleId))?.canRegister).toBe(false);
  });
  it("verifies the parent scope before reading any payment history", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await getMeliPaymentHistory("org", saleId)).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("uses tenant, sale and source warehouse filters for history and preserves the buyer snapshot", async () => {
    const result = await getMeliPaymentHistory("org", saleId);
    expect(result?.data[0].fiscal_receiver_snapshot).toEqual(receiver);
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", orgId);
    expect(mocks.eq).toHaveBeenCalledWith("sales_order_id", saleId);
    expect(mocks.eq).toHaveBeenCalledWith("warehouse_id", warehouseId);
    expect(mocks.range).toHaveBeenCalledWith(0, 19);
  });
  it("does not report an inconsistent server summary as a real collection balance", async () => {
    head.outstanding_amount = 1;
    await expect(getMeliPaymentSale("org", saleId)).rejects.toThrow(
      "no coincide"
    );
  });
  it("does not accept a void confirmation for a different record or an unvoided event", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        { payment_id: paymentId, idempotent: true, payment_status: "RECORDED" },
      ],
      error: null,
    });
    await expect(
      voidMeliPayment("org", { paymentId, reason: "Error de carga" })
    ).rejects.toMatchObject({ canEdit: false });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("denies unauthorized write access before creating an elevated client", async () => {
    mocks.ensure.mockRejectedValue(new Error("Sin permiso"));
    await expect(createMeliPayment("org", input)).rejects.toThrow(
      "Sin permiso"
    );
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("binds the signed-in actor and organization and commits without re-reading a possibly changed balance", async () => {
    expect(await createMeliPayment("org", input)).toMatchObject({
      payment_id: paymentId,
      saleId,
      payment_status: "RECORDED",
    });
    expect(mocks.ensure).toHaveBeenCalledWith(
      "mercadolibre.payments.manage",
      "org"
    );
    expect(mocks.rpc).toHaveBeenCalledWith("commit_mercadolibre_payment", {
      p_org_id: orgId,
      p_actor_id: actorId,
      p_idempotency_key: input.idempotencyKey,
      p_payload: {
        sales_order_id: saleId,
        amount: 60.5,
        currency: "ARS",
        payment_date: input.paymentDate,
        reference_number: "00012345",
        notes: "",
      },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("recovers a subsequently voided original event without pretending it is a current payment", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { payment_id: paymentId, idempotent: true, payment_status: "VOIDED" },
      ],
      error: null,
    });
    expect(await createMeliPayment("org", input)).toMatchObject({
      idempotent: true,
      payment_status: "VOIDED",
    });
  });
  it("keeps uncertain requests immutable and allows editing only after confirmed SQL rollback", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("timeout"));
    await expect(createMeliPayment("org", input)).rejects.toMatchObject({
      canEdit: false,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "Supera el saldo" },
    });
    await expect(createMeliPayment("org", input)).rejects.toMatchObject({
      canEdit: true,
    });
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });
  it("reports duplicate operations as organization-wide conflicts without reading another sale's records", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "23505",
        message:
          "duplicate key violates mercadolibre_payments_active_reference",
      },
    });
    await expect(createMeliPayment("org", input)).rejects.toMatchObject({
      canEdit: true,
      message:
        "El ID de operación ya tiene un cobro vigente en esta organización. Revisá los registros antes de repetir la carga.",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects an unverified confirmation instead of treating the write as safe to resubmit", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(createMeliPayment("org", input)).rejects.toMatchObject({
      canEdit: false,
    });
  });
  it("does not turn a cache-target lookup failure after void into an unknown monetary result", async () => {
    mocks.source.mockRejectedValueOnce(new Error("network"));
    expect(
      await voidMeliPayment("org", { paymentId, reason: "Error de carga" })
    ).toMatchObject({ payment_status: "VOIDED", saleId: null });
    expect(mocks.rpc).toHaveBeenCalledWith("void_mercadolibre_payment", {
      p_org_id: orgId,
      p_actor_id: actorId,
      p_payment_id: paymentId,
      p_reason: "Error de carga",
    });
  });
});
