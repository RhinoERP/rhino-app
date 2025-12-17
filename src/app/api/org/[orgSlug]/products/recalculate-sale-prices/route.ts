import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

type ProductWithPrice = {
  id: string;
  cost_price: number;
  profit_margin: number;
};

async function updateProductPrices(
  supabase: SupabaseClient,
  products: ProductWithPrice[]
) {
  let updated_count = 0;
  const errors: string[] = [];

  for (const product of products) {
    if (!(product.id && product.cost_price) || product.profit_margin === null) {
      continue;
    }

    // Calculate sale price: cost_price * (1 + profit_margin / 100)
    const sale_price =
      Math.round(product.cost_price * (1 + product.profit_margin / 100) * 100) /
      100;

    const { error: updateError } = await supabase
      .from("products")
      .update({ sale_price })
      .eq("id", product.id);

    if (updateError) {
      console.error(`Error updating product ${product.id}:`, updateError);
      errors.push(`Product ${product.id}: ${updateError.message}`);
    } else {
      updated_count += 1;
    }
  }

  return { updated_count, errors };
}

/**
 * Recalculates sale prices for all products in an organization based on:
 * - cost_price from the active price list (via products_with_price view)
 * - profit_margin from the products table
 *
 * Formula: sale_price = cost_price * (1 + profit_margin / 100)
 *
 * NOTE: With the updated products_with_price view that includes calculated_sale_price,
 * this endpoint is less critical as the view dynamically computes prices.
 * However, it can still be used to persist calculated prices to the products table
 * if needed for reporting or backup purposes.
 */
export async function POST(_request: Request, context: RouteContext) {
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

    // Get all products with their cost prices from the active price list
    const { data: productsWithPrice, error: fetchError } = await supabase
      .from("products_with_price")
      .select("id, cost_price, profit_margin")
      .eq("organization_id", org.id)
      .not("cost_price", "is", null)
      .not("profit_margin", "is", null);

    if (fetchError) {
      console.error("Error fetching products:", fetchError);
      return NextResponse.json(
        { error: "Error al obtener productos" },
        { status: 500 }
      );
    }

    if (!productsWithPrice || productsWithPrice.length === 0) {
      return NextResponse.json({
        success: true,
        updated_count: 0,
        message: "No hay productos con precios de costo y margen definidos",
      });
    }

    // Calculate and update sale prices
    const { updated_count, errors } = await updateProductPrices(
      supabase,
      productsWithPrice as ProductWithPrice[]
    );

    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          updated_count,
          errors,
          message: `Actualizado ${updated_count} productos con ${errors.length} errores`,
        },
        { status: 207 } // Multi-Status
      );
    }

    return NextResponse.json({
      success: true,
      updated_count,
      message: `Se actualizaron ${updated_count} precios de venta`,
    });
  } catch (error) {
    console.error("Error in recalculate sale prices:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
