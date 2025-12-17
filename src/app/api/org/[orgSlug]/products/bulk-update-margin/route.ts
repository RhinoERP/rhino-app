import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { orgSlug } = await context.params;

  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Get organization
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: "Organización no encontrada" },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { product_ids, profit_margin } = body;

    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return NextResponse.json(
        { error: "Se requiere una lista de IDs de productos" },
        { status: 400 }
      );
    }

    if (typeof profit_margin !== "number" || profit_margin < 0) {
      return NextResponse.json(
        { error: "El margen de ganancia debe ser un número mayor o igual a 0" },
        { status: 400 }
      );
    }

    // Update products
    const { error: updateError } = await supabase
      .from("products")
      .update({ profit_margin })
      .eq("organization_id", org.id)
      .in("id", product_ids);

    if (updateError) {
      console.error("Error updating products:", updateError);
      return NextResponse.json(
        { error: "Error al actualizar los productos" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updated_count: product_ids.length,
    });
  } catch (error) {
    console.error("Error in bulk update margin:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
