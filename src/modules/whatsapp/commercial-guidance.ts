import { z } from "zod";

export const commercialGuidanceSchema = z.object({
  deliveryPolicy: z.string().trim().max(4000).default(""),
  pickupPolicy: z.string().trim().max(4000).default(""),
  salesGuidance: z.string().trim().max(8000).default(""),
});

export function readCommercialGuidance(value: unknown) {
  const parsed = commercialGuidanceSchema.safeParse(value);
  return parsed.success ? parsed.data : commercialGuidanceSchema.parse({});
}

export const preSaleFollowUpMessage =
  "Dejé registrado tu pedido como preventa. A la brevedad se va a comunicar alguien del equipo comercial para reconfirmarlo y coordinar el retiro o envío de la mercadería.";
