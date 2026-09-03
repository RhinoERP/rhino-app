import { describe, expect, it } from "vitest";
import { whatsappIntegrationConfigurationSchema } from "./schemas";

const baseInput = {
  phoneNumberId: "123456789012345",
  displayPhoneNumber: "+54 9 11 1234-5678",
  businessHours: {},
  commercialRules: {},
  handoffMessage: null,
};

describe("whatsappIntegrationConfigurationSchema", () => {
  it("permite guardar una configuración inicial en borrador", () => {
    const result = whatsappIntegrationConfigurationSchema.safeParse({
      ...baseInput,
      status: "DRAFT",
      salesPriceListId: null,
      responsibleUserId: null,
    });

    expect(result.success).toBe(true);
  });

  it("exige lista y responsable antes de activar la integración", () => {
    const result = whatsappIntegrationConfigurationSchema.safeParse({
      ...baseInput,
      status: "ACTIVE",
      salesPriceListId: null,
      responsibleUserId: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual([
        "salesPriceListId",
        "responsibleUserId",
      ]);
    }
  });
});
