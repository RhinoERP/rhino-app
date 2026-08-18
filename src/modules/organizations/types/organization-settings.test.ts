import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_SETTINGS_DEFAULTS,
  organizationSettingsSchema,
} from "./organization-settings";

describe("organization remittance mask setting", () => {
  it("defaults to disabled for existing organizations", () => {
    expect(
      organizationSettingsSchema.parse({}).remittance_mask_printing_enabled
    ).toBe(false);
    expect(
      ORGANIZATION_SETTINGS_DEFAULTS.remittance_mask_printing_enabled
    ).toBe(false);
  });

  it("accepts explicit enablement", () => {
    expect(
      organizationSettingsSchema.parse({
        remittance_mask_printing_enabled: true,
      }).remittance_mask_printing_enabled
    ).toBe(true);
  });
});
