import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store" };
const searchSchema = z.object({
  customerId: z.uuid(),
  address: z.string().trim().min(3).max(500),
  city: z.string().trim().min(2).max(120),
  postalCode: z.string().trim().max(16),
});
const resultSchema = z.object({
  results: z.array(
    z.object({
      formatted: z.string(),
      lat: z.number().finite().min(-90).max(90),
      lon: z.number().finite().min(-180).max(180),
      country_code: z.string().optional(),
      result_type: z.string().optional(),
      housenumber: z.string().optional(),
    })
  ),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params;
  const access = await getSalesAccessContext(orgSlug);
  if (!(access.userId && (access.canManage || access.isOrganizationAdmin))) {
    return NextResponse.json(
      { error: "Sin permiso" },
      { status: 403, headers: HEADERS }
    );
  }
  const input = searchSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json(
      { error: "Ingresá una dirección y una ciudad válidas" },
      { status: 400, headers: HEADERS }
    );
  }
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    return NextResponse.json(
      { error: "Organización no encontrada" },
      { status: 404, headers: HEADERS }
    );
  }
  const supabase = await createClient();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, assigned_seller_id, is_active")
    .eq("organization_id", organization.id)
    .eq("id", input.data.customerId)
    .maybeSingle();
  if (
    customerError ||
    !customer ||
    !customer.is_active ||
    (!access.isOrganizationAdmin &&
      customer.assigned_seller_id !== null &&
      customer.assigned_seller_id !== access.userId)
  ) {
    return NextResponse.json(
      { error: "Cliente no encontrado" },
      { status: 404, headers: HEADERS }
    );
  }

  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "La búsqueda de direcciones aún no está configurada" },
      { status: 503, headers: HEADERS }
    );
  }
  const query = new URL("https://api.geoapify.com/v1/geocode/search");
  query.searchParams.set(
    "text",
    [input.data.address, input.data.postalCode, input.data.city, "Argentina"]
      .filter(Boolean)
      .join(", ")
  );
  query.searchParams.set("filter", "countrycode:ar");
  query.searchParams.set("lang", "es");
  query.searchParams.set("format", "json");
  query.searchParams.set("limit", "5");
  query.searchParams.set("apiKey", key);

  try {
    const response = await fetch(query, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "No se pudo consultar el buscador de direcciones" },
        { status: 502, headers: HEADERS }
      );
    }
    const parsed = resultSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("Respuesta de geocodificación inválida");
    }
    const candidates = parsed.data.results
      .filter((result) => result.country_code?.toLowerCase() === "ar")
      .map((result) => ({
        label: result.formatted,
        latitude: result.lat,
        longitude: result.lon,
        exactNumber: Boolean(result.housenumber),
      }));
    return NextResponse.json({ candidates }, { headers: HEADERS });
  } catch {
    return NextResponse.json(
      { error: "No se pudo consultar el buscador de direcciones" },
      { status: 502, headers: HEADERS }
    );
  }
}
