import type { SupabaseClient } from "@supabase/supabase-js";
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
  price?: number;
  amount_delta?: number;
  percentage?: number;
};

function validateRequest(body: BulkUpdatePriceRequest): NextResponse | null {
  const { item_ids, price, amount_delta, percentage } = body;

  if (!(item_ids && Array.isArray(item_ids)) || item_ids.length === 0) {
    return NextResponse.json(
      { error: "item_ids es requerido y debe ser un array no vacío" },
      { status: 400 }
    );
  }

  const providedFields = [price, amount_delta, percentage].filter(
    (value) => value !== undefined
  ).length;

  // Validate that only one update strategy is provided
  if (providedFields > 1) {
    return NextResponse.json(
      {
        error:
          "Debe proporcionar solo una estrategia de actualización: price, amount_delta o percentage",
      },
      { status: 400 }
    );
  }

  if (providedFields === 0) {
    return NextResponse.json(
      { error: "Debe proporcionar price, amount_delta o percentage" },
      { status: 400 }
    );
  }

  if (price !== undefined && (typeof price !== "number" || price < 0)) {
    return NextResponse.json(
      { error: "El precio debe ser un número mayor o igual a 0" },
      { status: 400 }
    );
  }

  if (
    amount_delta !== undefined &&
    (typeof amount_delta !== "number" || Number.isNaN(amount_delta))
  ) {
    return NextResponse.json(
      { error: "amount_delta debe ser un número válido" },
      { status: 400 }
    );
  }

  if (
    percentage !== undefined &&
    (typeof percentage !== "number" || percentage <= -100)
  ) {
    return NextResponse.json(
      { error: "El porcentaje debe ser mayor a -100" },
      { status: 400 }
    );
  }

  return null;
}

async function updateDeltaPrice(
  supabase: SupabaseClient,
  priceListId: string,
  itemIds: string[],
  amountDelta: number
): Promise<NextResponse | null> {
  const { data: items, error: fetchError } = await supabase
    .from("price_list_items")
    .select("id, cost_price")
    .eq("price_list_id", priceListId)
    .in("id", itemIds);

  if (fetchError || !items) {
    console.error("Error fetching price list items:", fetchError);
    return NextResponse.json(
      { error: "Error al obtener los precios actuales" },
      { status: 500 }
    );
  }

  const hasNegativeFinalPrice = items.some(
    (item) => (item.cost_price ?? 0) + amountDelta < 0
  );

  if (hasNegativeFinalPrice) {
    return NextResponse.json(
      { error: "El precio final no puede ser menor a 0" },
      { status: 400 }
    );
  }

  const updates = items.map((item) =>
    supabase
      .from("price_list_items")
      .update({ cost_price: (item.cost_price ?? 0) + amountDelta })
      .eq("id", item.id)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((result) => result.error);

  if (errors.length > 0) {
    console.error("Error updating some price list items:", errors);
    return NextResponse.json(
      { error: "Error al actualizar algunos precios" },
      { status: 500 }
    );
  }

  return null;
}

async function updateFixedPrice(
  supabase: SupabaseClient,
  priceListId: string,
  itemIds: string[],
  price: number
): Promise<NextResponse | null> {
  const { error: updateError } = await supabase
    .from("price_list_items")
    .update({ cost_price: price })
    .eq("price_list_id", priceListId)
    .in("id", itemIds);

  if (updateError) {
    console.error("Error updating price list items:", updateError);
    return NextResponse.json(
      { error: "Error al actualizar los precios" },
      { status: 500 }
    );
  }

  return null;
}

async function updatePercentagePrice(
  supabase: SupabaseClient,
  priceListId: string,
  itemIds: string[],
  percentage: number
): Promise<NextResponse | null> {
  // Fetch current prices first
  const { data: items, error: fetchError } = await supabase
    .from("price_list_items")
    .select("id, cost_price")
    .eq("price_list_id", priceListId)
    .in("id", itemIds);

  if (fetchError || !items) {
    console.error("Error fetching price list items:", fetchError);
    return NextResponse.json(
      { error: "Error al obtener los precios actuales" },
      { status: 500 }
    );
  }

  // Update each item with the percentage change
  const updates = items.map((item) => {
    const currentPrice = item.cost_price ?? 0;
    const newPrice = currentPrice * (1 + percentage / 100);
    return supabase
      .from("price_list_items")
      .update({ cost_price: newPrice })
      .eq("id", item.id);
  });

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    console.error("Error updating some price list items:", errors);
    return NextResponse.json(
      { error: "Error al actualizar algunos precios" },
      { status: 500 }
    );
  }

  return null;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { orgSlug, priceListId } = await params;
    const body = (await request.json()) as BulkUpdatePriceRequest;

    // Validate request
    const validationError = validateRequest(body);
    if (validationError) {
      return validationError;
    }

    const { item_ids, price, amount_delta, percentage } = body;

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
    let updateError: NextResponse | null = null;

    if (price !== undefined) {
      updateError = await updateFixedPrice(
        supabase,
        priceListId,
        item_ids,
        price
      );
    } else if (amount_delta !== undefined) {
      updateError = await updateDeltaPrice(
        supabase,
        priceListId,
        item_ids,
        amount_delta
      );
    } else if (percentage !== undefined) {
      updateError = await updatePercentagePrice(
        supabase,
        priceListId,
        item_ids,
        percentage
      );
    }

    if (updateError) {
      return updateError;
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
