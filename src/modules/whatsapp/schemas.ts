import { z } from "zod";
import { WHATSAPP_INTEGRATION_STATUSES } from "./types";

export const whatsappIntegrationConfigurationSchema = z
  .object({
    phoneNumberId: z
      .string()
      .trim()
      .min(1, "El ID del número de Meta es obligatorio")
      .max(128, "El ID del número de Meta es demasiado largo"),
    displayPhoneNumber: z
      .string()
      .trim()
      .max(64, "El número visible es demasiado largo")
      .nullable(),
    status: z.enum(WHATSAPP_INTEGRATION_STATUSES),
    salesPriceListId: z
      .string()
      .uuid("La lista de precios es inválida")
      .nullable(),
    responsibleUserId: z
      .string()
      .uuid("El vendedor responsable es inválido")
      .nullable(),
    businessHours: z.record(z.string(), z.unknown()).default({}),
    commercialRules: z.record(z.string(), z.unknown()).default({}),
    handoffMessage: z
      .string()
      .trim()
      .max(1000, "El mensaje de derivación no puede superar 1.000 caracteres")
      .nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.status !== "ACTIVE") {
      return;
    }

    if (!value.salesPriceListId) {
      ctx.addIssue({
        code: "custom",
        message: "Una integración activa requiere una lista de precios",
        path: ["salesPriceListId"],
      });
    }

    if (!value.responsibleUserId) {
      ctx.addIssue({
        code: "custom",
        message: "Una integración activa requiere un vendedor responsable",
        path: ["responsibleUserId"],
      });
    }
  });

export type WhatsAppIntegrationConfigurationInput = z.infer<
  typeof whatsappIntegrationConfigurationSchema
>;
