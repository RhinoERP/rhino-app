import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateOrgSettingsAction } from "./update-org-settings.action";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  update: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../utils/with-permission-guard", () => ({ ensure: mocks.ensure }));
vi.mock("../service/org-settings.service", () => ({
  updateOrgSettings: mocks.update,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

describe("organization settings authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects unauthorized changes before reading or writing settings", async () => {
    mocks.ensure.mockRejectedValue(new Error("forbidden"));
    await expect(
      updateOrgSettingsAction("org", { case_units_enabled: true })
    ).rejects.toThrow("forbidden");
    expect(mocks.ensure).toHaveBeenCalledWith("organization.admin", "org");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves platform-only flags and refreshes the configuration after an authorized change", async () => {
    mocks.update.mockResolvedValue({ case_units_enabled: true });
    await expect(
      updateOrgSettingsAction("org", {
        case_units_enabled: true,
        remittance_mask_printing_enabled: true,
      })
    ).resolves.toMatchObject({ success: true });
    expect(mocks.update).toHaveBeenCalledWith("org", {
      case_units_enabled: true,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/org/org/configuracion");
  });
});
