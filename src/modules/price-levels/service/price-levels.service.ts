import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { PriceLevel, PriceLevelWithStatus } from "../types";

function mapPriceLevelStatus(item: PriceLevel): PriceLevelWithStatus {
  const today = new Date().toISOString().split("T")[0];
  let status: "Active" | "Scheduled" | "Archived" = "Active";
  if (!item.is_active) {
    status = "Archived";
  } else if (item.valid_from && item.valid_from > today) {
    status = "Scheduled";
  }
  return { ...item, status };
}

export async function getPriceLevelsByOrgSlug(
  orgSlug: string
): Promise<PriceLevelWithStatus[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("price_levels")
    .select("*")
    .eq("organization_id", org.id)
    .order("margin", { ascending: true });

  if (error) {
    throw new Error(`Error obteniendo niveles de precio: ${error.message}`);
  }

  return (data ?? []).map(mapPriceLevelStatus);
}
