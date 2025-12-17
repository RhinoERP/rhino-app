import { NextResponse } from "next/server";
import { getPriceListItems } from "@/modules/price-lists/service/price-lists.service";

type RouteParams = {
  params: Promise<{
    orgSlug: string;
    priceListId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { orgSlug, priceListId } = await params;
    const items = await getPriceListItems(orgSlug, priceListId);

    return NextResponse.json(items);
  } catch (error) {
    console.error("Error fetching price list items:", error);
    return NextResponse.json(
      { error: "Failed to fetch price list items" },
      { status: 500 }
    );
  }
}
