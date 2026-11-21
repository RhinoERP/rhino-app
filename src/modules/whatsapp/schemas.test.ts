import { describe, expect, it } from "vitest";
import {
  whatsappFollowUpSchema,
  whatsappIntegrationConfigurationSchema,
} from "./schemas";
import { DEFAULT_WHATSAPP_FOLLOW_UP } from "./types";

const baseInput = {
  phoneNumberId: "123456789012345",
  displayPhoneNumber: "+54 9 11 1234-5678",
  businessHours: {},
  commercialRules: {},
  handoffMessage: null,
};

describe("whatsappIntegrationConfigurationSchema", () => {
  it("mantiene el seguimiento desactivado a 30 minutos para configuraciones existentes", () => {
    const result = whatsappIntegrationConfigurationSchema.parse({
      ...baseInput,
      status: "DRAFT",
      salesPriceListId: null,
      responsibleUserId: null,
    });
    expect(result.followUp).toEqual(DEFAULT_WHATSAPP_FOLLOW_UP);
  });

  it("guarda la activación, la espera y las instrucciones del seguimiento", () => {
    const result = whatsappIntegrationConfigurationSchema.parse({
      ...baseInput,
      status: "DRAFT",
      salesPriceListId: null,
      responsibleUserId: null,
      followUp: {
        enabled: true,
        delayMinutes: 45,
        instructions: "  Ofrecé ayuda.  ",
      },
    });
    expect(result.followUp).toEqual({
      enabled: true,
      delayMinutes: 45,
      instructions: "Ofrecé ayuda.",
    });
  });

  it.each([
    0,
    -1,
    1381,
    1.5,
    Number.NaN,
  ])("rechaza una espera inválida: %s", (delayMinutes) => {
    expect(
      whatsappFollowUpSchema.safeParse({
        ...DEFAULT_WHATSAPP_FOLLOW_UP,
        delayMinutes,
      }).success
    ).toBe(false);
  });

  it("rechaza instrucciones de seguimiento demasiado largas", () => {
    expect(
      whatsappFollowUpSchema.safeParse({
        ...DEFAULT_WHATSAPP_FOLLOW_UP,
        instructions: "x".repeat(2001),
      }).success
    ).toBe(false);
  });

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
      responseCapitalization: "STANDARD",
    });
  });

  it("permite guardar minúsculas en las respuestas del asistente", () => {
    const result = whatsappIntegrationConfigurationSchema.parse({
      ...baseInput,
      status: "DRAFT",
      salesPriceListId: null,
      responsibleUserId: null,
      commercialRules: { responseCapitalization: "LOWERCASE" },
    });
    expect(result.commercialRules.responseCapitalization).toBe("LOWERCASE");
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
