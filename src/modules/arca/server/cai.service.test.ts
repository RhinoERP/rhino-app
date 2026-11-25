import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCaiAutomationResult, startCaiOperation } from "./cai.service";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  access: vi.fn(),
  writes: [] as Record<string, unknown>[],
}));
vi.mock("server-only", () => ({}));
vi.mock("./access", () => ({
  getCurrentUserOrganizationArcaAccess: mocks.access,
}));
vi.mock("./client-factory", () => ({
  createArcaAutomationClient: () => ({ CreateAutomation: mocks.create }),
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
const org = "10000000-0000-4000-8000-000000000001";
const key = "70000000-0000-4000-8000-000000000001";
const operation = {
  id: "80000000-0000-4000-8000-000000000001",
  organization_id: org,
  request_key: key,
  kind: "validate",
  state: "starting",
  provider_id: null,
  params: {
    cuit: "30710158230",
    username: "20111111112",
    comprobantes: [{ puntoVenta: 9, tipoComprobante: 91, cantidad: 50 }],
    resguardo: false,
    validateOnly: true,
  },
  result: null,
  error: null,
  created_at: "2026-11-23T00:00:00Z",
};

describe("CAI provider integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writes.length = 0;
    mocks.access.mockResolvedValue({
      organization: { id: org, cuit: "30710158230" },
      userId: "actor",
      canManage: true,
    });
    mocks.rpc.mockResolvedValue({ data: operation, error: null });
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        neq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: {
            organization_id: org,
            cuit: "30710158230",
            enabled: true,
            mode: "self_printed",
            login_cuit: "20111111112",
            point_of_sale: 9,
            business_name: "Safe",
            address: "Calle 123",
            vat_condition: "IVA RESPONSABLE INSCRITO",
            gross_income: "123",
            activity_start: "2020-01-01",
          },
          error: null,
        })),
        update: vi.fn((data: Record<string, unknown>) => {
          mocks.writes.push({ table, ...data });
          return query;
        }),
        // biome-ignore lint/suspicious/noThenProperty: Supabase queries are awaitable builders.
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [{ id: operation.id }], error: null }).then(
            resolve
          ),
      };
      return query;
    });
    mocks.create.mockResolvedValue({
      id: "provider-job",
      status: "complete",
      data: { status: "validated" },
    });
  });
  it("uses the saved provider credential and never sends a password or certificate", async () => {
    await startCaiOperation("safe", {
      requestKey: key,
      kind: "validate",
      quantity: 50,
    });
    expect(mocks.create).toHaveBeenCalledWith(
      "cai-request",
      operation.params,
      false
    );
    const params = mocks.create.mock.calls[0][1];
    expect(params).not.toHaveProperty("password");
    expect(params).not.toHaveProperty("cert");
    expect(params).not.toHaveProperty("key");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_remittance_cai_operation",
      expect.objectContaining({ p_result: { status: "validated" } })
    );
  });
  it("does not call the provider again when a duplicate attempt was already claimed", async () => {
    mocks.from.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              organization_id: org,
              cuit: "30710158230",
              enabled: true,
              mode: "self_printed",
              login_cuit: "20111111112",
              point_of_sale: 9,
              business_name: "Safe",
              address: "Calle",
              vat_condition: "IVA EXENTO",
              gross_income: "123",
              activity_start: "2020-01-01",
            },
            error: null,
          }),
        }),
      }),
    }));
    mocks.from.mockImplementationOnce(() => {
      const query = {
        update: () => query,
        eq: () => query,
        select: async () => ({ data: [], error: null }),
      };
      return query;
    });
    await startCaiOperation("safe", {
      requestKey: key,
      kind: "validate",
      quantity: 50,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("retains ambiguous failures for reconciliation without an automatic retry", async () => {
    mocks.create.mockRejectedValue(new Error("network lost"));
    await startCaiOperation("safe", {
      requestKey: key,
      kind: "validate",
      quantity: 50,
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.writes).toEqual(
      expect.arrayContaining([expect.objectContaining({ state: "uncertain" })])
    );
  });
  it("requires organization administration before using the provider", async () => {
    mocks.access.mockResolvedValue({ canManage: false });
    await expect(
      startCaiOperation("other-org", {
        requestKey: key,
        kind: "validate",
        quantity: 50,
      })
    ).rejects.toThrow("administrador");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a provider result for a different point of sale", () => {
    expect(() =>
      parseCaiAutomationResult(
        { ...operation, kind: "request" },
        {
          status: "requested",
          cai: "12345678901234",
          vencimiento: "31/12/2026",
          comprobantes: [
            { puntoVenta: "10", tipoComprobante: "91", cantidad: "50" },
          ],
        }
      )
    ).toThrow("corresponde");
  });
  it("accepts partial authorization but keeps its actual quantity and strips other fields", () => {
    const result = parseCaiAutomationResult(
      { ...operation, kind: "request" },
      {
        status: "requested",
        cai: "12345678901234",
        vencimiento: "31/12/2026",
        password: "should-never-persist",
        comprobantes: [
          { puntoVenta: "9", tipoComprobante: "91", cantidad: "20" },
        ],
      }
    );
    expect(result).toEqual({
      status: "requested",
      cai: "12345678901234",
      expiresAt: "2026-12-31",
      solicitud: "",
      quantity: 20,
    });
  });
});
