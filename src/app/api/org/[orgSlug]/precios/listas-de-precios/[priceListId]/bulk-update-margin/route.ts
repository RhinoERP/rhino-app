import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type RouteParams = {
  params: Promise<{
    orgSlug: string;
    priceListId: string;
  }>;
};

type BulkUpdateMarginRequest = {
  item_ids: string[];
  profit_margin: number;
};

type UpdateProductsOptions = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  priceListId: string;
  orgId: string;
  itemIds: string[];
  profitMargin: number;
};

async function updateProductsIfActive(options: UpdateProductsOptions) {
  const { supabase, priceListId, orgId, itemIds, profitMargin } = options;

  const { data: priceListData, error: fetchError } = await supabase
    .from("price_lists")
    .select("is_active")
    .eq("id", priceListId)
    .eq("organization_id", orgId)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  if (!priceListData.is_active) {
    return false;
  }

  const { data: items, error: itemsError } = await supabase
    .from("price_list_items")
    .select("product_id, cost_price")
    .in("id", itemIds);

  if (itemsError) {
    throw itemsError;
  }

  for (const item of items) {
    const salePrice =
      Math.round(item.cost_price * (1 + profitMargin / 100) * 100) / 100;

    const { error: productError } = await supabase
      .from("products")
      .update({
        profit_margin: profitMargin,
        sale_price: salePrice,
      })
      .eq("id", item.product_id);

    if (productError) {
      throw productError;
    }
  }

  return true;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { orgSlug, priceListId } = await params;
    const body = (await request.json()) as BulkUpdateMarginRequest;

    const { item_ids, profit_margin } = body;

    if (!(item_ids && Array.isArray(item_ids)) || item_ids.length === 0) {
      return NextResponse.json(
        { error: "item_ids is required and must be a non-empty array" },
        { status: 400 }
      );
    }

    if (typeof profit_margin !== "number") {
      return NextResponse.json(
        { error: "profit_margin must be a number" },
        { status: 400 }
      );
    }

    const org = await getOrganizationBySlug(orgSlug);

    if (!org?.id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const supabase = await createClient();

    const { error: priceListError } = await supabase
      .from("price_list_items")
      .update({ profit_margin })
      .eq("price_list_id", priceListId)
      .in("id", item_ids);

    if (priceListError) {
      throw priceListError;
    }

    const updatedProducts = await updateProductsIfActive({
      supabase,
      priceListId,
      orgId: org.id,
      itemIds: item_ids,
      profitMargin: profit_margin,
    });

    return NextResponse.json({
      success: true,
      updatedProducts,
    });
  } catch (error) {
    console.error("Error updating profit margins:", error);
    return NextResponse.json(
      { error: "Failed to update profit margins" },
      { status: 500 }
    );
  }
}
