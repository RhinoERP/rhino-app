import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuthResponse } from "@/lib/supabase/auth";

const exchangeRateSchema = z.object({
  venta: z.number(),
  fechaActualizacion: z.string(),
});

type ExchangeRateData = z.infer<typeof exchangeRateSchema>;

async function fetchBlueRate(): Promise<ExchangeRateData> {
  const res = await fetch("https://dolarapi.com/v1/dolares/blue");

  if (!res.ok) {
    throw new Error(`Error al obtener cotización: ${res.status}`);
  }

  const raw = await res.json();
  return exchangeRateSchema.parse(raw);
}

export async function GET(_request: NextRequest) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const rate = await fetchBlueRate();
    return NextResponse.json(rate);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al obtener la cotización";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
