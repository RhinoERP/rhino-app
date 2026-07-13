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
import { requireAuth } from "@/lib/supabase/auth";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

const ACCOUNTING_SERVICE_URL = process.env.ACCOUNTING_SERVICE_URL;
const SERVICE_TOKEN = process.env.ACCOUNTING_SERVICE_TOKEN;
const ORG_SLUG_HEADER = "x-org-slug";

type ParsedProxyBody = {
  contentType: string;
  isJsonBodyRequest: boolean;
  rawBody: string | null;
  parsedBody: Record<string, unknown> | null;
};

async function parseProxyBody(req: NextRequest): Promise<ParsedProxyBody> {
  const contentType = req.headers.get("content-type") ?? "";
  const isJsonBodyRequest =
    req.method !== "GET" &&
    req.method !== "HEAD" &&
    contentType.toLowerCase().includes("application/json");
  const rawBody =
    req.method !== "GET" && req.method !== "HEAD" ? await req.text() : null;

  let parsedBody: Record<string, unknown> | null = null;

  if (isJsonBodyRequest && rawBody) {
    const parsed = JSON.parse(rawBody) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      parsedBody = parsed as Record<string, unknown>;
    }
  }

  return {
    contentType,
    isJsonBodyRequest,
    rawBody,
    parsedBody,
  };
}

function resolveOrgSlug(
  req: NextRequest,
  parsedBody: Record<string, unknown> | null
): string | null {
  return (
    req.headers.get(ORG_SLUG_HEADER) ??
    req.nextUrl.searchParams.get("org_slug") ??
    (typeof parsedBody?.orgSlug === "string" ? parsedBody.orgSlug : null)
  );
}

function buildUpstreamUrl(
  route: string[],
  req: NextRequest,
  organizationId: string
): URL {
  const path = route.join("/");
  const url = new URL(`${ACCOUNTING_SERVICE_URL}/${path}`);
  const upstreamSearchParams = new URLSearchParams(req.nextUrl.search);

  upstreamSearchParams.delete("org_slug");
  upstreamSearchParams.set("org_id", organizationId);
  url.search = upstreamSearchParams.toString();

  return url;
}

function buildProxyInit(params: {
  req: NextRequest;
  contentType: string;
  isJsonBodyRequest: boolean;
  rawBody: string | null;
  parsedBody: Record<string, unknown> | null;
  organizationId: string;
  orgSlug: string;
}): RequestInit {
  const {
    req,
    contentType,
    isJsonBodyRequest,
    rawBody,
    parsedBody,
    organizationId,
    orgSlug,
  } = params;
  const headers: Record<string, string> = {
    "X-Service-Token": SERVICE_TOKEN as string,
  };
  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method === "GET" || req.method === "HEAD") {
    return init;
  }

  headers["Content-Type"] = contentType || "application/json";

  if (isJsonBodyRequest) {
    init.body = JSON.stringify({
      ...(parsedBody ?? {}),
      org_id: organizationId,
      orgId: organizationId,
      orgSlug,
    });
    return init;
  }

  init.body = rawBody ?? undefined;
  return init;
}

async function buildProxyResponse(upstream: Response): Promise<NextResponse> {
  const body = await upstream.arrayBuffer();
  const responseHeaders = new Headers();
  const upstreamContentType = upstream.headers.get("content-type");
  const contentDisposition = upstream.headers.get("content-disposition");

  if (upstreamContentType) {
    responseHeaders.set("Content-Type", upstreamContentType);
  }

  if (contentDisposition) {
    responseHeaders.set("Content-Disposition", contentDisposition);
  }

  return new NextResponse(body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

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
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!(ACCOUNTING_SERVICE_URL && SERVICE_TOKEN)) {
    return NextResponse.json(
      { ok: false, error: "Servicio contable no configurado" },
      { status: 503 }
    );
  }

  const { contentType, isJsonBodyRequest, rawBody, parsedBody } =
    await parseProxyBody(req);
  const orgSlug = resolveOrgSlug(req, parsedBody);

  if (!orgSlug) {
    return NextResponse.json(
      { ok: false, error: "orgSlug requerido" },
      { status: 400 }
    );
  }

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    return NextResponse.json(
      { ok: false, error: "Organización no encontrada" },
      { status: 404 }
    );
  }

  const { data: membership, error: membershipError } = await auth.supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organization.id)
    .eq("user_id", auth.userId)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json(
      { ok: false, error: membershipError.message },
      { status: 500 }
    );
  }

  if (!membership) {
    return NextResponse.json(
      { ok: false, error: "Sin acceso a la organización solicitada" },
      { status: 403 }
    );
  }

  const url = buildUpstreamUrl(route, req, organization.id);
  const init = buildProxyInit({
    req,
    contentType,
    isJsonBodyRequest,
    rawBody,
    parsedBody,
    organizationId: organization.id,
    orgSlug,
  });

  try {
    const upstream = await fetch(url, init);
    return await buildProxyResponse(upstream);
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
