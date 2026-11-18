import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCollectionsPageAccess } from "./collections-access.service";

const mocks = vi.hoisted(() => ({ layout: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationLayoutData: mocks.layout,
}));
describe("collections page boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it("lets a Meli-only collector enter the module when wholesale is disabled", async () => {
    mocks.layout.mockResolvedValue({
      currentOrganization: { wholesale_enabled: false, pos_enabled: true },
      permissions: ["mercadolibre.payments.manage"],
    });
    expect(
      (await getCollectionsPageAccess("org", "mercadoLibre")).sections
    ).toEqual({ currentAccounts: false, mercadoLibre: true });
    await expect(
      getCollectionsPageAccess("org", "currentAccounts")
    ).rejects.toThrow("redirect:/org/org/cobranzas/mercado-libre");
  });
  it("does not let legacy collection rights or sales rights unlock Meli money records", async () => {
    mocks.layout.mockResolvedValue({
      currentOrganization: { wholesale_enabled: true, pos_enabled: true },
      permissions: ["collections.manage", "mercadolibre.manage"],
    });
    await expect(
      getCollectionsPageAccess("org", "mercadoLibre")
    ).rejects.toThrow("redirect:/org/org");
    expect(
      (await getCollectionsPageAccess("org", "currentAccounts")).sections
        .currentAccounts
    ).toBe(true);
  });
  it("denies unavailable sessions and disabled modules", async () => {
    mocks.layout.mockResolvedValueOnce(null);
    await expect(getCollectionsPageAccess("org")).rejects.toThrow(
      "redirect:/auth/login"
    );
    mocks.layout.mockResolvedValue({
      currentOrganization: { wholesale_enabled: false, pos_enabled: false },
      permissions: ["mercadolibre.payments.manage"],
    });
    await expect(getCollectionsPageAccess("org")).rejects.toThrow(
      "redirect:/org/org"
    );
  });
});
