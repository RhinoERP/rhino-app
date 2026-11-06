import { z } from "zod";

const quoteSchema = z.object({
  sell: z.number().finite().positive(),
  updatedAt: z.string().min(1),
});

/** Suggested BNA sell quote. Document snapshots, not this live quote, value payments. */
export async function fetchSuggestedUsdQuote() {
  const response = await fetch("https://monedapi.ar/api/v2/usd/bna", {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error("No se pudo obtener la cotización BNA.");
  }
  const quote = quoteSchema.parse(await response.json());
  return { venta: quote.sell, fechaActualizacion: quote.updatedAt };
}
