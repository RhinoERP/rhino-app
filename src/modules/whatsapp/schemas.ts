import { z } from "zod";
import {
  DEFAULT_WHATSAPP_BUSINESS_HOURS,
  DEFAULT_WHATSAPP_RESPONSE_DELAY,
  WHATSAPP_INTEGRATION_STATUSES,
  WHATSAPP_WEEKDAYS,
} from "./types";

const businessHoursDaySchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usá el formato HH:MM"),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usá el formato HH:MM"),
});

const businessHoursSchema = z
  .object({
    enabled: z.boolean().default(DEFAULT_WHATSAPP_BUSINESS_HOURS.enabled),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .default(DEFAULT_WHATSAPP_BUSINESS_HOURS.timezone),
    weeklySchedule: z
      .object(
        Object.fromEntries(
          WHATSAPP_WEEKDAYS.map((day) => [day, businessHoursDaySchema])
        ) as Record<
          (typeof WHATSAPP_WEEKDAYS)[number],
          typeof businessHoursDaySchema
        >
      )
      .default(DEFAULT_WHATSAPP_BUSINESS_HOURS.weeklySchedule),
  })
  .default(DEFAULT_WHATSAPP_BUSINESS_HOURS)
  .superRefine((hours, ctx) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: hours.timezone });
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "La zona horaria no es válida (por ejemplo, America/Argentina/Buenos_Aires)",
        path: ["timezone"],
      });
    }

    if (!hours.enabled) {
      return;
    }
    const hasEnabledDay = WHATSAPP_WEEKDAYS.some(
      (day) => hours.weeklySchedule[day].enabled
    );
    if (!hasEnabledDay) {
      ctx.addIssue({
        code: "custom",
        message: "Activá al menos un día de atención",
        path: ["weeklySchedule"],
      });
    }
    for (const day of WHATSAPP_WEEKDAYS) {
      const schedule = hours.weeklySchedule[day];
      if (schedule.enabled && schedule.start >= schedule.end) {
        ctx.addIssue({
          code: "custom",
          message: "La hora de cierre debe ser posterior a la de apertura",
          path: ["weeklySchedule", day, "end"],
        });
      }
    }
  });

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
    businessHours: businessHoursSchema,
    responseDelayMinMinutes: z
      .number()
      .int()
      .min(0)
      .max(120)
      .default(DEFAULT_WHATSAPP_RESPONSE_DELAY.minMinutes),
    responseDelayMaxMinutes: z
      .number()
      .int()
      .min(0)
      .max(120)
      .default(DEFAULT_WHATSAPP_RESPONSE_DELAY.maxMinutes),
    commercialRules: z.record(z.string(), z.unknown()).default({}),
    handoffMessage: z
      .string()
      .trim()
      .max(1000, "El mensaje de derivación no puede superar 1.000 caracteres")
      .nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.responseDelayMinMinutes > value.responseDelayMaxMinutes) {
      ctx.addIssue({
        code: "custom",
        message: "La demora mínima no puede superar la máxima",
        path: ["responseDelayMaxMinutes"],
      });
    }

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
