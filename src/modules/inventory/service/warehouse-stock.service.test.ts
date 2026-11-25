import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWarehouseTransfers } from "./warehouse-stock.service";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  member: vi.fn(),
  assignment: vi.fn(),
  transfers: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({ requireAuth: mocks.auth }));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org-a" }),
}));

const warehouseId = "11111111-1111-4111-8111-111111111111";

describe("acceso al historial de transferencias", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({
      userId: "user-a",
      supabase: { from: mocks.from, rpc: mocks.rpc },
    });
    mocks.member.mockResolvedValue({ data: { is_owner: false }, error: null });
    mocks.assignment.mockResolvedValue({
      data: { warehouse_id: warehouseId },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: ["inventory.read"], error: null });
    mocks.transfers.mockResolvedValue({
      data: [{ id: "transfer-a" }],
      error: null,
    });
    mocks.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: mocks.member,
      maybeSingle: mocks.assignment,
      limit: mocks.transfers,
    }));
  });

  it.each([
    "inventory.read",
    "inventory.read.all",
    "inventory.manage",
  ])("permite %s con asignación al depósito", async (permission) => {
    mocks.rpc.mockResolvedValue({ data: [permission], error: null });
    await expect(getWarehouseTransfers("org-a", warehouseId)).resolves.toEqual([
      { id: "transfer-a" },
    ]);
    expect(mocks.assignment).toHaveBeenCalledOnce();
  });

  it("un permiso de lectura global no omite la asignación", async () => {
    mocks.rpc.mockResolvedValue({ data: ["inventory.read.all"], error: null });
    mocks.assignment.mockResolvedValue({ data: null, error: null });
    await expect(getWarehouseTransfers("org-a", warehouseId)).rejects.toThrow(
      "No tenés acceso al depósito"
    );
    expect(mocks.transfers).not.toHaveBeenCalled();
  });

  it("rechaza miembros sin permiso de inventario", async () => {
    mocks.rpc.mockResolvedValue({ data: ["sales.read"], error: null });
    await expect(getWarehouseTransfers("org-a", warehouseId)).rejects.toThrow(
      "No tenés permiso"
    );
    expect(mocks.transfers).not.toHaveBeenCalled();
  });

  it("permite al propietario consultar sin asignación", async () => {
    mocks.member.mockResolvedValue({ data: { is_owner: true }, error: null });
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(
      getWarehouseTransfers("org-a", warehouseId)
    ).resolves.toHaveLength(1);
    expect(mocks.assignment).not.toHaveBeenCalled();
  });

  it("permite organization.admin sin asignación", async () => {
    mocks.rpc.mockResolvedValue({ data: ["organization.admin"], error: null });
    await expect(
      getWarehouseTransfers("org-a", warehouseId)
    ).resolves.toHaveLength(1);
    expect(mocks.assignment).not.toHaveBeenCalled();
  });

  it("no consulta transferencias si no puede verificar permisos", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "fallo" } });
    await expect(getWarehouseTransfers("org-a", warehouseId)).rejects.toThrow(
      "No se pudieron verificar los permisos"
    );
    expect(mocks.transfers).not.toHaveBeenCalled();
  });
});
