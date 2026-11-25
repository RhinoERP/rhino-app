import { beforeEach, describe, expect, it, vi } from "vitest";
import PosModuleLayout from "@/app/org/[orgSlug]/venta-directa/layout";

const mocks = vi.hoisted(() => ({
  organization: vi.fn(),
  layoutData: vi.fn(),
  moduleGuard: vi.fn(),
  permissionGuard: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: mocks.organization,
  getOrganizationLayoutData: mocks.layoutData,
}));
vi.mock("@/modules/organizations/service/module-access.service", () => ({
  guardOrganizationModuleAccess: mocks.moduleGuard,
  guardOrganizationPermissionAccess: mocks.permissionGuard,
}));

const renderLayout = () =>
  PosModuleLayout({
    params: Promise.resolve({ orgSlug: "desarrollo-dealers" }),
    children: "Venta directa",
  });

describe("direct sales layout access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.organization.mockResolvedValue({ production_enabled: true });
    mocks.layoutData.mockResolvedValue({ permissions: ["organization.admin"] });
    mocks.redirect.mockImplementation(() => {
      throw new Error("redirect");
    });
  });

  it("allows administrators with production enabled without explicit MercadoLibre permission", async () => {
    expect(await renderLayout()).toBe("Venta directa");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.moduleGuard).toHaveBeenCalledWith("desarrollo-dealers", "pos");
    expect(mocks.permissionGuard).toHaveBeenCalledWith(
      "desarrollo-dealers",
      expect.arrayContaining(["pos.read", "mercadolibre.access"])
    );
  });

  it("preserves the MercadoLibre exception", async () => {
    mocks.layoutData.mockResolvedValue({
      permissions: ["mercadolibre.access"],
    });
    expect(await renderLayout()).toBe("Venta directa");
  });

  it("preserves the production restriction for other users", async () => {
    mocks.layoutData.mockResolvedValue({ permissions: ["pos.read"] });
    await expect(renderLayout()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/org/desarrollo-dealers");
  });

  it("allows POS readers when production is disabled", async () => {
    mocks.organization.mockResolvedValue({ production_enabled: false });
    mocks.layoutData.mockResolvedValue({ permissions: ["pos.read"] });
    expect(await renderLayout()).toBe("Venta directa");
    expect(mocks.permissionGuard).toHaveBeenCalled();
  });

  it("does not bypass disabled-module or permission guards for administrators", async () => {
    mocks.moduleGuard.mockRejectedValueOnce(new Error("module disabled"));
    await expect(renderLayout()).rejects.toThrow("module disabled");
    mocks.permissionGuard.mockRejectedValueOnce(new Error("permission denied"));
    await expect(renderLayout()).rejects.toThrow("permission denied");
  });
});
