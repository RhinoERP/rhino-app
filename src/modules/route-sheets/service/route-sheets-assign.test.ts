import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  rpc,
  assignRpc,
  dispatch,
  routeStatus,
  secondDocumentType,
  incompleteSite,
  assignedToSameSheet,
} = vi.hoisted(() => ({
  rpc: vi.fn(),
  assignRpc: vi.fn(),
  dispatch: vi.fn(),
  routeStatus: { value: "PENDING" },
  secondDocumentType: { value: "STANDARD" },
  incompleteSite: { value: false },
  assignedToSameSheet: { value: false },
}));

const orgId = "11111111-1111-4111-8111-111111111111";
const saleA = "22222222-2222-4222-8222-222222222222";
const saleB = "33333333-3333-4333-8333-333333333333";
const siteA = "44444444-4444-4444-8444-444444444444";
const siteB = "55555555-5555-4555-8555-555555555555";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: orgId,
                status: routeStatus.value,
                carrier_id: null,
              },
              error: null,
            }),
          }),
          in: async () => ({
            data: [saleA, saleB].map((id) => ({
              id,
              customer_id: orgId,
              sale_number: id === saleA ? 7 : 13,
              status: "CONFIRMED",
              document_type:
                id === saleB ? secondDocumentType.value : "STANDARD",
              user_id: orgId,
              route_sheet_id:
                id === saleA && assignedToSameSheet.value ? orgId : null,
              remittance_number: null,
            })),
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: async () => ({ id: orgId }),
}));
vi.mock("@/modules/sales/service/sales.service", () => ({
  getSalesAccessContext: async () => ({
    canManage: true,
    userId: orgId,
    isOrganizationAdmin: false,
    canManageAll: false,
  }),
  dispatchSaleOrder: dispatch,
}));

const input = {
  orgSlug: "org",
  routeSheetId: orgId,
  saleIds: [saleA, saleB],
  remittances: { [saleA]: "R1", [saleB]: "R2" },
  siteIds: { [saleA]: siteA, [saleB]: siteB },
};

describe("assigning sales to a route sheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeStatus.value = "PENDING";
    secondDocumentType.value = "STANDARD";
    incompleteSite.value = false;
    assignedToSameSheet.value = false;
    rpc.mockImplementation((name: string, args: unknown) => {
      if (name === "commercial_site_catalog") {
        return Promise.resolve({
          error: null,
          data: [siteA, siteB].map((id) => ({
            id,
            customerId: orgId,
            name: "QA",
            address: "Calle de prueba",
            city: id === siteB && incompleteSite.value ? "" : "Rosario",
            notes: null,
            active: true,
            latitude: null,
            longitude: null,
          })),
        });
      }
      return assignRpc(name, args);
    });
    assignRpc.mockResolvedValue({ error: null });
    dispatch.mockResolvedValue({ status: "DISPATCH" });
  });

  it("assigns each sale to its own selected site and ignores duplicate IDs", async () => {
    const { addSalesToRouteSheet } = await import("./route-sheets.service");
    await addSalesToRouteSheet({ ...input, saleIds: [saleA, saleA, saleB] });
    expect(assignRpc).toHaveBeenCalledTimes(2);
    expect(assignRpc).toHaveBeenNthCalledWith(
      1,
      "commercial_site_assign_delivery",
      expect.objectContaining({
        p_sale: saleA,
        p_site: siteA,
        p_remittance: "R1",
      })
    );
    expect(assignRpc).toHaveBeenNthCalledWith(
      2,
      "commercial_site_assign_delivery",
      expect.objectContaining({
        p_sale: saleB,
        p_site: siteB,
        p_remittance: "R2",
      })
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("rejects fiscal advance documents before assigning any sale", async () => {
    secondDocumentType.value = "ADVANCE";
    const { addSalesToRouteSheet } = await import("./route-sheets.service");
    await expect(addSalesToRouteSheet(input)).rejects.toThrow(
      "documentos de anticipo o saldo"
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects incomplete delivery sites before assigning any sale", async () => {
    incompleteSite.value = true;
    const { addSalesToRouteSheet } = await import("./route-sheets.service");
    await expect(addSalesToRouteSheet(input)).rejects.toThrow(
      "dirección y ciudad completas"
    );
    expect(assignRpc).not.toHaveBeenCalled();
  });

  it("never overwrites a prior assignment on a stale batch retry", async () => {
    assignedToSameSheet.value = true;
    const { addSalesToRouteSheet } = await import("./route-sheets.service");
    await expect(addSalesToRouteSheet(input)).rejects.toThrow(
      "ya está asignada a esta hoja"
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports partial assignment and stops instead of silently retrying prior sales", async () => {
    assignRpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "Sucursal inactiva" } });
    const { addSalesToRouteSheet } = await import("./route-sheets.service");
    await expect(addSalesToRouteSheet(input)).rejects.toThrow(
      "Se asignaron 1 de 2 ventas"
    );
    expect(assignRpc).toHaveBeenCalledTimes(2);
    expect(assignRpc).toHaveBeenNthCalledWith(
      1,
      "commercial_site_assign_delivery",
      expect.objectContaining({ p_sale: saleA, p_site: siteA })
    );
  });

  it("identifies a sale left assigned when dispatch fails and never submits the next sale", async () => {
    routeStatus.value = "IN_PROGRESS";
    dispatch.mockRejectedValue(new Error("Sin conexión"));
    const { addSalesToRouteSheet } = await import("./route-sheets.service");
    await expect(addSalesToRouteSheet(input)).rejects.toThrow(
      "Reintentar despacho"
    );
    expect(assignRpc).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ saleId: saleA, routeSheetId: orgId })
    );
  });
});
