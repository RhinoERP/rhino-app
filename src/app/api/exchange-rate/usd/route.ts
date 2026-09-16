import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuthResponse } from "@/lib/supabase/auth";

// Contrato expuesto a los clientes (venta + fechaActualizacion).
const exchangeRateSchema = z.object({
  venta: z.number(),
  fechaActualizacion: z.string(),
});

type ExchangeRateData = z.infer<typeof exchangeRateSchema>;

// Schema de la API de origen (Dólar Banco Nación).
const monedapiSchema = z.object({
  sell: z.number(),
  updatedAt: z.string(),
});

async function fetchUsdRate(): Promise<ExchangeRateData> {
  const res = await fetch("https://monedapi.ar/api/v2/usd/bna");

  if (!res.ok) {
    throw new Error(`Error al obtener cotización: ${res.status}`);
  }

  const raw = await res.json();
  const parsed = monedapiSchema.parse(raw);

  return {
    venta: parsed.sell,
    fechaActualizacion: parsed.updatedAt,
  };
}

export async function GET(_request: NextRequest) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const rate = await fetchUsdRate();
    return NextResponse.json(rate);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al obtener la cotización";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
