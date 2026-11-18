import { beforeEach, describe, expect, it, vi } from "vitest";
import { correctMeliReceiver } from "./meli-receiver-correction.service";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  auth: vi.fn(),
  sale: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  single: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: mocks.ensure,
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuth: mocks.auth }));
vi.mock("./meli-read.service", () => ({ getMeliSale: mocks.sale }));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: () => ({ from: mocks.from }),
}));

const saleId = "00000000-0000-4000-8000-000000000001";
const receiver = {
  version: 1,
  tax_condition: "CONSUMIDOR_FINAL",
  document_type: "DNI",
  document_number: "12345678",
  first_name: "Ana",
  last_name: "Pérez",
  address: "Calle 1",
};
const updatedAt = "2026-11-16T12:00:00.000Z";
const input = {
  saleId,
  expectedUpdatedAt: updatedAt,
  receiver: { ...receiver, address: "Calle 2" },
  reason: "Corregir dirección informada por el comprador",
};

describe("Meli receiver corrections", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: "actor" });
    mocks.sale.mockResolvedValue({
      id: saleId,
      organizationId: "org",
      warehouse_id: "warehouse",
      status: "DELIVERED",
      arca_status: "error",
      updated_at: updatedAt,
      receiver,
    });
    const query = {
      select: () => query,
      update: mocks.update,
      eq: mocks.eq,
      in: mocks.in,
      maybeSingle: mocks.single,
    };
    mocks.from.mockReturnValue(query);
    mocks.update.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.in.mockReturnValue(query);
    mocks.single
      .mockResolvedValueOnce({
        data: {
          organization_id: "org",
          commercial_snapshot: { meli_input_fingerprint: "original" },
          arca_request_json: { rejected: true },
          arca_last_error: "Receptor inválido",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: saleId }, error: null });
  });
  it.each([
    "pending",
    "authorized",
  ])("rejects %s before obtaining an elevated client", async (arcaStatus) => {
    mocks.sale.mockResolvedValue({
      status: "DELIVERED",
      arca_status: arcaStatus,
    });
    await expect(correctMeliReceiver("org", input)).rejects.toThrow(
      "rechazo confirmado"
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("retains original replay identity and rejected fiscal evidence in an audited correction", async () => {
    await correctMeliReceiver("org", input);
    expect(mocks.ensure).toHaveBeenCalledWith("mercadolibre.invoice", "org");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        fiscal_receiver_snapshot: input.receiver,
        commercial_snapshot: expect.objectContaining({
          meli_input_fingerprint: "original",
          meli_receiver_corrections: [
            expect.objectContaining({
              actor_id: "actor",
              previous: receiver,
              receiver: input.receiver,
              rejected_request: { rejected: true },
            }),
          ],
        }),
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(mocks.eq).toHaveBeenCalledWith("updated_at", updatedAt);
    expect(mocks.in).toHaveBeenCalledWith("arca_status", [
      "not_requested",
      "error",
    ]);
  });
  it("does not overwrite a concurrent fiscal start", async () => {
    mocks.single
      .mockReset()
      .mockResolvedValueOnce({
        data: {
          organization_id: "org",
          commercial_snapshot: {},
          arca_request_json: null,
          arca_last_error: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(correctMeliReceiver("org", input)).rejects.toThrow(
      "inició su emisión"
    );
  });
  it("rejects stale edits before loading commercial snapshots", async () => {
    await expect(
      correctMeliReceiver("org", { ...input, expectedUpdatedAt: "old" })
    ).rejects.toThrow("La venta cambió");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
