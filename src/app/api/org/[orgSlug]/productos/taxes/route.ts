import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

const MAX_PRODUCT_IDS = 100;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateProductIds(raw: string[]): string[] {
  return raw
    .filter(Boolean)
    .filter((id) => UUID_REGEX.test(id))
    .slice(0, MAX_PRODUCT_IDS);
}

export async function GET(request: Request, context: RouteContext) {
  const authError = await requireAuthResponse();
  if (authError) {
    return authError;
  }

  try {
    const { orgSlug } = await context.params;
    const { searchParams } = new URL(request.url);
    const rawIds = searchParams.get("ids")?.split(",") ?? [];
    const ids = validateProductIds(rawIds);

    if (ids.length === 0) {
      return NextResponse.json([]);
    }

    const supabase = await createClient();
    const { data: organization, error: orgError } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .single();

    if (orgError || !organization) {
      return NextResponse.json(
        { error: "Organización no encontrada" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("product_tax_assignments")
      .select("product_id, tax:taxes(id, name, rate, code, is_active)")
      .eq("organization_id", organization.id)
      .in("product_id", ids);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al obtener impuestos de productos",
      },
      { status: 500 }
    );
  }
}
