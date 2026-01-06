import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type RouteParams = {
  params: Promise<{
    orgSlug: string;
    priceListId: string;
  }>;
};

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { orgSlug, priceListId } = await params;

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

    // Delete the price list (cascade will delete items)
    const { error: deleteError } = await supabase
      .from("price_lists")
      .delete()
      .eq("id", priceListId)
      .eq("organization_id", org.id);

    if (deleteError) {
      console.error("Error deleting price list:", deleteError);
      return NextResponse.json(
        { error: "Error al eliminar la lista de precios" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lista de precios eliminada correctamente",
    });
  } catch (error) {
    console.error("Error in delete price list:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
