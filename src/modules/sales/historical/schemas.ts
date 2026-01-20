import { z } from "zod";

export const historicalSalesRowSchema = z.object({
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
  cantidad_pedidos: z
    .number()
    .int()
    .nonnegative("La cantidad de pedidos no puede ser negativa"),
  notas: z.string().optional(),
});

export const importHistoricalSalesSchema = z.object({
  data: z
    .array(historicalSalesRowSchema)
    .min(1, "Debe importar al menos una fila"),
});

export type HistoricalSalesRowInput = z.infer<typeof historicalSalesRowSchema>;
