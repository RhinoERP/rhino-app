import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type RouteParams = {
  params: Promise<{
    orgSlug: string;
    priceListId: string;
  }>;
};

type BulkUpdatePriceRequest = {
  item_ids: string[];
  price: number;
};

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { orgSlug, priceListId } = await params;
    const body = (await request.json()) as BulkUpdatePriceRequest;

    const { item_ids, price } = body;

    if (!(item_ids && Array.isArray(item_ids)) || item_ids.length === 0) {
      return NextResponse.json(
        { error: "item_ids es requerido y debe ser un array no vacío" },
        { status: 400 }
      );
    }

    if (typeof price !== "number" || price < 0) {
      return NextResponse.json(
        { error: "El precio debe ser un número mayor o igual a 0" },
        { status: 400 }
      );
    }

    const org = await getOrganizationBySlug(orgSlug);

    if (!org?.id) {
      return NextResponse.json(
        { error: "Organización no encontrada" },
        { status: 404 }
      );
    }

    const supabase = await createClient();

    // Verify price list belongs to organization
    const { data: priceList, error: priceListError } = await supabase
      .from("price_lists")
      .select("id, organization_id")
      .eq("id", priceListId)
      .eq("organization_id", org.id)
      .single();

    if (priceListError || !priceList) {
      return NextResponse.json(
        { error: "Lista de precios no encontrada" },
        { status: 404 }
      );
    }

    // Update the cost_price for the selected items
    const { error: updateError } = await supabase
      .from("price_list_items")
      .update({ cost_price: price })
      .eq("price_list_id", priceListId)
      .in("id", item_ids);

    if (updateError) {
      console.error("Error updating price list items:", updateError);
      return NextResponse.json(
        { error: "Error al actualizar los precios" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updated_count: item_ids.length,
    });
  } catch (error) {
    console.error("Error in bulk update price:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
