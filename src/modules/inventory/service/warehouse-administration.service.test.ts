import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  replaceWarehouseAssignmentsSchema,
  saveWarehouseSchema,
  warehouseAssignmentsFormSchema,
  warehouseFormSchema,
} from "../warehouse-admin.types";
import {
  getWarehouseAdministrationData,
  replaceManagedWarehouseAssignments,
  saveManagedWarehouse,
} from "./warehouse-administration.service";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: "org-a" }),
}));

const orgA = "org-a";
const warehouseA = "11111111-1111-4111-8111-111111111111";
const warehouseB = "22222222-2222-4222-8222-222222222222";
const userOwner = "33333333-3333-4333-8333-333333333333";
const userAdmin = "44444444-4444-4444-8444-444444444444";
const userRegular = "55555555-5555-4555-8555-555555555555";
const userInactive = "66666666-6666-4666-8666-666666666666";
const userOtherOrg = "77777777-7777-4777-8777-777777777777";

type QueryResult = { data: unknown; error: { message: string } | null };

function chain(result: QueryResult) {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

const warehouses = [
  {
    id: warehouseA,
    organization_id: orgA,
    name: "Principal",
    code: null,
    is_active: true,
    is_default: true,
    wholesale_enabled: true,
    direct_sale_enabled: true,
  },
  {
    id: warehouseB,
    organization_id: orgA,
    name: "Sucursal",
    code: "SUC",
    is_active: false,
    is_default: false,
    wholesale_enabled: true,
    direct_sale_enabled: false,
  },
];

const members = [
  {
    user_id: userOwner,
    organization_id: orgA,
    full_name: "Owner",
    email: "owner@example.com",
    role_id: "role-owner",
    role_name: "Propietario",
    is_owner: true,
    is_active: true,
  },
  {
    user_id: userAdmin,
    organization_id: orgA,
    full_name: "Admin",
    email: "admin@example.com",
    role_id: "role-admin",
    role_name: "Administrador",
    is_owner: false,
    is_active: true,
  },
  {
    user_id: userRegular,
    organization_id: orgA,
    full_name: null,
    email: "regular@example.com",
    role_id: "role-user",
    role_name: "Vendedor",
    is_owner: false,
    is_active: true,
  },
  {
    user_id: userInactive,
    organization_id: orgA,
    full_name: "Inactivo",
    email: "inactive@example.com",
    role_id: "role-user",
    role_name: "Vendedor",
    is_owner: false,
    is_active: false,
  },
  {
    user_id: userOtherOrg,
    organization_id: "org-b",
    full_name: "Otra org",
    email: "other@example.com",
    role_id: "role-user",
    role_name: "Vendedor",
    is_owner: false,
    is_active: true,
  },
];

describe("administración de depósitos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockImplementation((table: string) => {
      if (table === "warehouses") {
        return chain({ data: warehouses, error: null });
      }
      if (table === "warehouse_user_assignments") {
        return chain({
          data: [
            { user_id: userOwner, warehouse_id: warehouseA },
            { user_id: userRegular, warehouse_id: warehouseB },
          ],
          error: null,
        });
      }
      if (table === "role_permissions") {
        return chain({ data: [{ role_id: "role-admin" }], error: null });
      }
      return chain({ data: [], error: null });
    });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_organization_members_with_users") {
        return chain({ data: members, error: null });
      }
      return Promise.resolve({ data: "warehouse-new", error: null });
    });
  });

  it("aísla depósitos y miembros por organización y excluye inactivos", async () => {
    const data = await getWarehouseAdministrationData("org-a");

    expect(data.warehouses).toHaveLength(2);
    expect(data.members.map((member) => member.userId)).toEqual([
      userOwner,
      userAdmin,
      userRegular,
    ]);
    expect(mocks.from).toHaveBeenCalledWith("warehouses");
    expect(mocks.from).toHaveBeenCalledWith("warehouse_user_assignments");
    expect(
      data.members.find((member) => member.userId === userRegular)
    ).toEqual(
      expect.objectContaining({
        name: "regular@example.com",
        warehouseIds: [warehouseB],
        hasAllAccess: false,
      })
    );
  });

  it("marca propietarios y administradores como acceso total", async () => {
    const data = await getWarehouseAdministrationData("org-a");

    expect(
      data.members.find((member) => member.userId === userOwner)?.hasAllAccess
    ).toBe(true);
    expect(
      data.members.find((member) => member.userId === userAdmin)?.hasAllAccess
    ).toBe(true);
    expect(
      data.members.find((member) => member.userId === userRegular)?.hasAllAccess
    ).toBe(false);
  });

  it("guarda nombre, estado y canales usando el id de la organización", async () => {
    await expect(
      saveManagedWarehouse({
        orgSlug: "org-a",
        name: "  Depósito nuevo  ",
        code: "  ",
        isActive: true,
        wholesaleEnabled: true,
        directSaleEnabled: false,
      })
    ).resolves.toBe("warehouse-new");

    expect(mocks.rpc).toHaveBeenCalledWith("save_warehouse", {
      p_org_id: orgA,
      p_warehouse_id: undefined,
      p_name: "Depósito nuevo",
      p_code: undefined,
      p_is_active: true,
      p_wholesale_enabled: true,
      p_direct_sale_enabled: false,
    });
  });

  it("rechaza guardar sin canales antes de invocar la RPC", async () => {
    await expect(
      saveManagedWarehouse({
        orgSlug: "org-a",
        name: "Sin canales",
        code: "",
        isActive: true,
        wholesaleEnabled: false,
        directSaleEnabled: false,
      })
    ).rejects.toThrow("al menos un canal");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("permite dejar a un usuario sin depósitos y propaga errores de la RPC", async () => {
    await expect(
      replaceManagedWarehouseAssignments({
        orgSlug: "org-a",
        userId: userRegular,
        warehouseIds: [],
      })
    ).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "replace_warehouse_user_assignments",
      {
        p_org_id: orgA,
        p_user_id: userRegular,
        p_warehouse_ids: [],
      }
    );

    mocks.rpc.mockReturnValueOnce(
      Promise.resolve({ data: null, error: { message: "Usuario ajeno" } })
    );
    await expect(
      replaceManagedWarehouseAssignments({
        orgSlug: "org-a",
        userId: userOtherOrg,
        warehouseIds: [warehouseA],
      })
    ).rejects.toThrow("Usuario ajeno");
  });
});

describe("schemas de administración de depósitos", () => {
  it("exige al menos un canal de venta", () => {
    expect(
      warehouseFormSchema.safeParse({
        name: "Principal",
        code: "",
        isActive: true,
        wholesaleEnabled: false,
        directSaleEnabled: false,
      }).success
    ).toBe(false);
    expect(
      warehouseFormSchema.safeParse({
        name: "Principal",
        code: "",
        isActive: true,
        wholesaleEnabled: false,
        directSaleEnabled: true,
      }).success
    ).toBe(true);
  });

  it("valida el id de depósito a editar y recorta el código", () => {
    expect(
      saveWarehouseSchema.safeParse({
        orgSlug: "org-a",
        warehouseId: "no-es-uuid",
        name: "Principal",
        code: " SUC ",
        isActive: true,
        wholesaleEnabled: true,
        directSaleEnabled: true,
      }).success
    ).toBe(false);
    const parsed = saveWarehouseSchema.parse({
      orgSlug: "org-a",
      warehouseId: warehouseA,
      name: " Principal ",
      code: " SUC ",
      isActive: true,
      wholesaleEnabled: true,
      directSaleEnabled: true,
    });
    expect(parsed.name).toBe("Principal");
    expect(parsed.code).toBe("SUC");
  });

  it("acepta una lista vacía y rechaza depósitos repetidos", () => {
    expect(
      warehouseAssignmentsFormSchema.safeParse({ warehouseIds: [] }).success
    ).toBe(true);
    expect(
      warehouseAssignmentsFormSchema.safeParse({
        warehouseIds: [warehouseA, warehouseA],
      }).success
    ).toBe(false);
    expect(
      replaceWarehouseAssignmentsSchema.safeParse({
        orgSlug: "org-a",
        userId: userRegular,
        warehouseIds: [warehouseA, warehouseB],
      }).success
    ).toBe(true);
  });
});
