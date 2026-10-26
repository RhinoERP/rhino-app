import { beforeEach, describe, expect, it, vi } from "vitest";

const { maybeSingle } = vi.hoisted(() => ({ maybeSingle: vi.fn() }));
vi.mock("./supabase-admin", () => ({
  createWhatsAppAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { assertWhatsAppEnabled } from "./access";

describe("WhatsApp opt-in per organization", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    undefined,
    null,
    {},
  ])("hides both capabilities for missing flags: %s", (organization) => {
    expect(isOrganizationModuleEnabled(organization, "whatsapp")).toBe(false);
    expect(isOrganizationModuleEnabled(organization, "whatsapp_sandbox")).toBe(
      false
    );
  });

  it("enables the sandbox independently of the real channel", async () => {
    const organization = {
      is_active: true,
      whatsapp_enabled: false,
      whatsapp_sandbox_enabled: true,
    };
    expect(isOrganizationModuleEnabled(organization, "whatsapp")).toBe(false);
    expect(isOrganizationModuleEnabled(organization, "whatsapp_sandbox")).toBe(
      true
    );
    maybeSingle.mockResolvedValue({ data: organization, error: null });
    await expect(
      assertWhatsAppEnabled("org", "whatsapp_sandbox")
    ).resolves.toBeUndefined();
    await expect(assertWhatsAppEnabled("org")).rejects.toThrow(
      "no está habilitado"
    );
  });

  it("does not enable the sandbox by enabling WhatsApp", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        is_active: true,
        whatsapp_enabled: true,
        whatsapp_sandbox_enabled: false,
      },
      error: null,
    });
    await expect(assertWhatsAppEnabled("org")).resolves.toBeUndefined();
    await expect(
      assertWhatsAppEnabled("org", "whatsapp_sandbox")
    ).rejects.toThrow("no está habilitado");
  });

  it.each([
    { data: null, error: null },
    {
      data: {
        is_active: false,
        whatsapp_enabled: true,
        whatsapp_sandbox_enabled: true,
      },
      error: null,
    },
    {
      data: {
        is_active: true,
        whatsapp_enabled: true,
        whatsapp_sandbox_enabled: true,
      },
      error: { message: "database unavailable" },
    },
  ])("rejects missing/inactive tenants and database failures", async (result) => {
    maybeSingle.mockResolvedValue(result);
    await expect(assertWhatsAppEnabled("org")).rejects.toThrow(
      "no está habilitado"
    );
    await expect(
      assertWhatsAppEnabled("org", "whatsapp_sandbox")
    ).rejects.toThrow("no está habilitado");
  });
});
