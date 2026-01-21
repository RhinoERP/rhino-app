import { z } from "zod";

export const historicalPurchaseRowSchema = z.object({
  mes: z
    .number()
    .int()
    .min(1, "El mes debe estar entre 1 y 12")
    .max(12, "El mes debe estar entre 1 y 12"),
  año: z
    .number()
    .int()
    .min(2000, "El año debe ser mayor a 2000")
    .max(2100, "El año debe ser menor a 2100"),
  monto_total: z.number().nonnegative("El monto total no puede ser negativo"),
  cantidad_ordenes: z
    .number()
    .int()
    .nonnegative("La cantidad de órdenes no puede ser negativa"),
  notas: z.string().optional(),
});

export const importHistoricalPurchasesSchema = z.object({
  data: z
    .array(historicalPurchaseRowSchema)
    .min(1, "Debe importar al menos una fila"),
});

export type HistoricalPurchaseRowInput = z.infer<
  typeof historicalPurchaseRowSchema
>;
