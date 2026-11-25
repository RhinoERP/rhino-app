import { z } from "zod";
import type { StockMetrics } from "../types";

const metricFields = {
  warehouseScoped: z.boolean(),
  totalProducts: z.number().int().nonnegative(),
  activeProducts: z.number().int().nonnegative(),
  inactiveProducts: z.number().int().nonnegative(),
  totalUnits: z.number().nonnegative(),
  totalKg: z.number().nonnegative(),
  totalLt: z.number().nonnegative(),
  lowStockCount: z.number().int().nonnegative(),
};

const stockMetricsSchema = z.discriminatedUnion("canViewCosts", [
  z.object({
    ...metricFields,
    canViewCosts: z.literal(true),
    totalStockValue: z.number(),
    totalStockValueUsd: z.number().optional(),
    unpricedStockProducts: z.number().int().nonnegative().optional(),
  }),
  z.object({ ...metricFields, canViewCosts: z.literal(false) }),
]);

export function parseStockMetrics(data: unknown): StockMetrics {
  const result = stockMetricsSchema.safeParse(data);
  if (!result.success) {
    throw new Error("La respuesta de indicadores de stock es inválida");
  }
  return result.data;
}
