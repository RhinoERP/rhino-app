/**
 * Proxy catch-all hacia el servicio contable Express.
 * Reenvía todos los requests a ACCOUNTING_SERVICE_URL con el SERVICE_TOKEN.
 *
 * Rutas disponibles:
 *   POST /api/contabilidad/preview
 *   POST /api/contabilidad/eventos
 *   GET  /api/contabilidad/asientos/:id
 *   PUT  /api/contabilidad/asientos/:id/completar
 *   GET  /api/contabilidad/diario          (Semana 3)
 *   GET  /api/contabilidad/mayor/:cuentaId (Semana 3)
 *   GET  /api/contabilidad/libros/iva      (Semana 3)
 *   GET  /api/contabilidad/libros/iibb     (Semana 3)
 *   GET  /api/contabilidad/pendientes      (Semana 3)
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";

const ACCOUNTING_SERVICE_URL = process.env.ACCOUNTING_SERVICE_URL;
const SERVICE_TOKEN = process.env.ACCOUNTING_SERVICE_TOKEN;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ route: string[] }> }
) {
  return proxyRequest(req, await params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ route: string[] }> }
) {
  return proxyRequest(req, await params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ route: string[] }> }
) {
  return proxyRequest(req, await params);
}

async function proxyRequest(
  req: NextRequest,
  { route }: { route: string[] }
): Promise<NextResponse> {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  if (!(ACCOUNTING_SERVICE_URL && SERVICE_TOKEN)) {
    return NextResponse.json(
      { ok: false, error: "Servicio contable no configurado" },
      { status: 503 }
    );
  }

  const path = route.join("/");
  const search = req.nextUrl.search;
  const url = `${ACCOUNTING_SERVICE_URL}/${path}${search}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Service-Token": SERVICE_TOKEN,
  };

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  try {
    const upstream = await fetch(url, init);
    const body = await upstream.text();

    return new NextResponse(body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de red";
    return NextResponse.json(
      {
        ok: false,
        error: `No se pudo conectar al servicio contable: ${message}`,
      },
      { status: 502 }
    );
  }
}
