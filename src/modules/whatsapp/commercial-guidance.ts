import { z } from "zod";
import { responseCapitalizations } from "../../../services/whatsapp-agent/src/response-capitalization";

export const commercialGuidanceSchema = z.object({
  deliveryPolicy: z.string().trim().max(4000).default(""),
  pickupPolicy: z.string().trim().max(4000).default(""),
  salesGuidance: z.string().trim().max(8000).default(""),
  responseCapitalization: z.enum(responseCapitalizations).default("STANDARD"),
});

export function readCommercialGuidance(value: unknown) {
  const parsed = commercialGuidanceSchema.safeParse(value);
  return parsed.success ? parsed.data : commercialGuidanceSchema.parse({});
}

export const preSaleFollowUpMessage =
  "Listo, dejé anotado tu pedido. Te van a escribir para confirmarlo y coordinar el retiro o el envío.";
