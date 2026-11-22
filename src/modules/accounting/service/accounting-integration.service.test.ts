import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOrgSettings } = vi.hoisted(() => ({ getOrgSettings: vi.fn() }));
vi.mock("@/modules/organizations/service/org-settings.service", () => ({
  getOrgSettings,
}));

import {
  isAccountingIntegrationEnabled,
  isMeliAccountingIntegrationEnabled,
} from "./accounting-integration.service";

describe("Mercado Libre accounting enablement", () => {
  beforeEach(() => {
    getOrgSettings.mockReset();
  });

  it.each([
    [false, false, false],
    [false, true, false],
    [true, false, false],
    [true, true, true],
  ])("requires both general (%s) and Meli (%s) configuration", async (general, meli, expected) => {
    getOrgSettings.mockResolvedValue({
      accounting_integration_enabled: general,
      mercadolibre_accounting_enabled: meli,
    });
    expect(await isMeliAccountingIntegrationEnabled("org")).toBe(expected);
    expect(await isAccountingIntegrationEnabled("org")).toBe(general);
  });

  it("propagates configuration errors instead of reporting success", async () => {
    getOrgSettings.mockRejectedValue(new Error("Configuración inaccesible"));
    await expect(isMeliAccountingIntegrationEnabled("org")).rejects.toThrow(
      "Configuración inaccesible"
    );
  });
});
