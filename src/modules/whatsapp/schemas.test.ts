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
  it("preserva reglas existentes y valida las nuevas políticas comerciales", () => {
    const result = whatsappIntegrationConfigurationSchema.parse({
      ...baseInput,
      status: "DRAFT",
      salesPriceListId: null,
      responsibleUserId: null,
      commercialRules: {
        legacyRule: true,
        deliveryPolicy: " Reparto los martes. ",
      },
    });
    expect(result.commercialRules).toEqual({
      legacyRule: true,
      deliveryPolicy: "Reparto los martes.",
      pickupPolicy: "",
      salesGuidance: "",
    });
  });

  it("rechaza políticas demasiado largas antes de guardar la configuración", () => {
    const result = whatsappIntegrationConfigurationSchema.safeParse({
      ...baseInput,
      status: "DRAFT",
      salesPriceListId: null,
      responsibleUserId: null,
      commercialRules: { deliveryPolicy: "x".repeat(4001) },
    });
    expect(result.success).toBe(false);
  });

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

  it("allows registered-only pricing without a general list unless fallback is enabled", () => {
    const input = {
      ...baseInput,
      status: "ACTIVE",
      pricingMode: "REGISTERED_ONLY",
      salesPriceListId: null,
      responsibleUserId: "11111111-1111-4111-8111-111111111111",
    };
    expect(
      whatsappIntegrationConfigurationSchema.parse(input)
        .allowGeneralForCustomers
    ).toBe(false);
    expect(
      whatsappIntegrationConfigurationSchema.safeParse({
        ...input,
        allowGeneralForCustomers: true,
      }).success
    ).toBe(false);
  });
});
