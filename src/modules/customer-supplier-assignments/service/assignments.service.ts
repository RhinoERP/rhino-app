import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getPriceListsByOrgSlug } from "@/modules/price-lists/service/price-lists.service";
import type { PriceList } from "@/modules/price-lists/types";
import { getSalesPriceListsByOrgSlug } from "@/modules/sales-price-lists/service/sales-price-lists.service";
import type {
  CustomerSupplierAssignment,
  UpsertAssignmentInput,
} from "../types";

export async function getAssignmentsByCustomer(
  orgSlug: string,
  customerId: string
): Promise<CustomerSupplierAssignment[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customer_supplier_assignments")
    .select(
      `
      *,
      supplier:suppliers(name),
      price_list:price_lists(name),
      sales_price_list:sales_price_lists(name)
    `
    )
    .eq("customer_id", customerId)
    .eq("organization_id", org.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Error obteniendo asignaciones: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    ...row,
    supplier: undefined,
    price_list: undefined,
    sales_price_list: undefined,
    supplier_name: (row.supplier as { name?: string } | null)?.name,
    price_list_name: (row.price_list as { name?: string } | null)?.name,
    sales_price_list_name: (row.sales_price_list as { name?: string } | null)
      ?.name,
  }));
}

export async function upsertAssignment(
  orgSlug: string,
  input: UpsertAssignmentInput
): Promise<{ success: boolean; error?: string }> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("customer_supplier_assignments").upsert(
    {
      organization_id: org.id,
      customer_id: input.customerId,
      supplier_id: input.supplierId,
      price_list_id: input.priceListId,
      sales_price_list_id: input.salesPriceListId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "customer_id,supplier_id" }
  );

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function deleteAssignment(
  orgSlug: string,
  assignmentId: string
): Promise<{ success: boolean; error?: string }> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("customer_supplier_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("organization_id", org.id);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function countAssignmentsByOrg(orgSlug: string): Promise<number> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return 0;
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("customer_supplier_assignments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);

  return count ?? 0;
}

export async function getAssignmentForProduct(
  orgSlug: string,
  customerId: string,
  supplierId: string
): Promise<{
  priceListId: string | null;
  salesPriceListId: string | null;
} | null> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return null;
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from("customer_supplier_assignments")
    .select("price_list_id, sales_price_list_id")
    .eq("customer_id", customerId)
    .eq("supplier_id", supplierId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!data) {
    return null;
  }
  return {
    priceListId: data.price_list_id,
    salesPriceListId: data.sales_price_list_id,
  };
}

export async function getPurchasePriceListsByOrg(
  orgSlug: string
): Promise<(PriceList & { supplierName?: string })[]> {
  try {
    const priceLists = await getPriceListsByOrgSlug(orgSlug);
    return priceLists.map((pl) => ({
      ...pl,
      supplierName: pl.supplier_name,
    }));
  } catch (error) {
    console.error("Error obteniendo listas de compra:", error);
    return [];
  }
}

export async function getSalesPriceListsByOrg(
  orgSlug: string
): Promise<{ id: string; name: string }[]> {
  try {
    const salesPriceLists = await getSalesPriceListsByOrgSlug(orgSlug);
    return salesPriceLists.map((spl) => ({
      id: spl.id,
      name: spl.name,
    }));
  } catch (error) {
    console.error("Error obteniendo listas de venta:", error);
    return [];
  }
}
