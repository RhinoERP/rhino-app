import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuthResponse } from "@/lib/supabase/auth";

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const MONEDAPI_DATE_URL = "https://monedapi.ar/api/v2/date";

// Contrato expuesto a los clientes (venta + fechaActualizacion).
const exchangeRateSchema = z.object({
  venta: z.number(),
  fechaActualizacion: z.string(),
});

type ExchangeRateData = z.infer<typeof exchangeRateSchema>;

// Schema de la API de origen (Dólar Banco Nación, cotización del momento).
const monedapiSchema = z.object({
  sell: z.number(),
  updatedAt: z.string(),
});

// Schema del endpoint histórico: `sell` puede venir null si el par no cotizó
// en la fecha (o en el día hábil anterior a la misma).
const monedapiDateSchema = z.object({
  sell: z.number().nullable(),
  quotedAt: z.string().nullable(),
});

export class PreviousQuoteUnavailableError extends Error {
  constructor() {
    super(
      "No se encontró cotización BNA para el día hábil previo. Reintentá o cargá la cotización manualmente."
    );
    this.name = "PreviousQuoteUnavailableError";
  }
}

function getArgentinaDateParts(value: Date): {
  year: string;
  month: string;
  day: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!(year && month && day)) {
    throw new Error("No se pudo derivar la fecha en Argentina.");
  }

  return { year, month, day };
}

/**
 * Devuelve el día calendario previo en Argentina (YYYY-MM-DD). Se construye
 * desde el mediodía UTC equivalente para evitar corrimientos por la zona
 * horaria (Argentina no tiene horario de verano).
 */
export function getPreviousArgentinaDate(now: Date = new Date()): string {
  const { year, month, day } = getArgentinaDateParts(now);
  const todayAtUtcNoon = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 12)
  );
  todayAtUtcNoon.setUTCDate(todayAtUtcNoon.getUTCDate() - 1);
  return todayAtUtcNoon.toISOString().slice(0, 10);
}

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

export async function fetchUsdRateForDate(
  date: string
): Promise<ExchangeRateData> {
  const apiKey = process.env.MONEDAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("MONEDAPI_API_KEY no está configurada.");
  }

  const res = await fetch(`${MONEDAPI_DATE_URL}/${date}/usd/bna`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Clave de MonedAPI inválida o sin acceso a cotizaciones históricas."
    );
  }

  if (!res.ok) {
    throw new Error(`Error al obtener cotización histórica: ${res.status}`);
  }

  const raw = await res.json();
  const parsed = monedapiDateSchema.parse(raw);

  if (parsed.sell === null) {
    throw new PreviousQuoteUnavailableError();
  }

  return {
    venta: parsed.sell,
    fechaActualizacion: parsed.quotedAt ?? new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const usePrevious = request.nextUrl.searchParams.get("previous") === "1";
    const rate = usePrevious
      ? await fetchUsdRateForDate(getPreviousArgentinaDate())
      : await fetchUsdRate();
    return NextResponse.json(rate);
  } catch (error) {
    if (error instanceof PreviousQuoteUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message =
      error instanceof Error ? error.message : "Error al obtener la cotización";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
