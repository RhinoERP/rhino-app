import { z } from "zod";

// ------------------------------------------------------------
// Completar asiento SUSPENSO — PUT /asientos/:id/completar
// ------------------------------------------------------------
export const CompletarAsientoLineaSchema = z.object({
  lineaId: z.string().uuid(),
  cuentaId: z.string().uuid(),
});

export const CompletarAsientoSchema = z.object({
  lineas: z.array(CompletarAsientoLineaSchema).min(1),
});

export type CompletarAsientoInput = z.infer<typeof CompletarAsientoSchema>;
export type CompletarAsientoLinea = z.infer<typeof CompletarAsientoLineaSchema>;
