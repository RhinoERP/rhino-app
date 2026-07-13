import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  ImportPriceListItem,
  ImportPriceListResult,
  PriceList,
  PriceListItem,
} from "../types";

export type CreatePriceListInput = {
  orgSlug: string;
  supplier_id: string;
  name: string;
  valid_from: string;
  items: ImportPriceListItem[];
  notes?: string | null;
};

export type UpdatePriceListInput = {
  orgSlug: string;
  priceListId: string;
  valid_from?: string;
  name?: string;
};

/**
 * Returns all price lists that belong to the organization identified by the slug.
 */
export async function getPriceListsByOrgSlug(
  orgSlug: string
): Promise<PriceList[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  // First get all price list IDs for this org
  const { data: orgPriceLists, error: orgError } = await supabase
    .from("price_lists")
    .select("id, organization_id")
    .eq("organization_id", org.id);

  if (orgError) {
    throw new Error(`Error fetching price lists: ${orgError.message}`);
  }

  const priceListIds = (orgPriceLists ?? []).map((pl) => pl.id);

  if (priceListIds.length === 0) {
    return [];
  }

  // Now get the data from the view with status
  const { data, error } = await supabase
    .from("price_lists_with_status")
    .select(
      `
      id,
      name,
      supplier_id,
      valid_from,
      status
    `
    )
    .in("id", priceListIds)
    .order("valid_from", { ascending: false });

  if (error) {
    throw new Error(`Error fetching price lists: ${error.message}`);
  }

  // Get supplier names separately
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .in(
      "id",
      (data ?? []).map((item) => item.supplier_id).filter(Boolean) as string[]
    );

  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  // Get created_at and replaced_by_list_id from base table
  const { data: metadata } = await supabase
    .from("price_lists")
    .select("id, created_at, replaced_by_list_id")
    .in("id", priceListIds);

  const metadataMap = new Map(
    (metadata ?? []).map((m) => [
      m.id,
      { created_at: m.created_at, replaced_by_list_id: m.replaced_by_list_id },
    ])
  );

  const priceLists: PriceList[] = (data ?? []).map((item) => {
    const meta = metadataMap.get(item.id ?? "");
    const replacedByListId = meta?.replaced_by_list_id ?? null;
    const baseStatus =
      (item.status as "Active" | "Scheduled" | "Archived") ?? "Active";
    return {
      id: item.id ?? "",
      supplier_id: item.supplier_id ?? "",
      name: item.name ?? "",
      valid_from: item.valid_from ?? "",
      created_at: meta?.created_at ?? undefined,
      supplier_name: supplierMap.get(item.supplier_id ?? ""),
      replaced_by_list_id: replacedByListId,
      status: replacedByListId ? "Inactive" : baseStatus,
    };
  });

  return priceLists;
}

/**
 * Imports a price list by calling the import_price_list RPC function.
 */
export async function importPriceList(
  input: CreatePriceListInput
): Promise<ImportPriceListResult> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (!input.name?.trim()) {
    throw new Error("El nombre de la lista de precios es requerido");
  }

  if (!input.supplier_id) {
    throw new Error("El proveedor es requerido");
  }

  if (!input.items || input.items.length === 0) {
    throw new Error("Debe proporcionar al menos un item en el archivo");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("import_price_list", {
    p_organization_id: org.id,
    p_supplier_id: input.supplier_id,
    p_name: input.name,
    p_valid_from: input.valid_from,
    p_items: input.items,
    p_notes: input.notes ?? undefined,
  });

  if (error) {
    throw new Error(`Error importando lista de precios: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo importar la lista de precios");
  }

  const result = data as ImportPriceListResult;

  if (result.is_active) {
    await deactivateOtherActivePriceLists(
      org.id,
      input.supplier_id,
      result.price_list_id
    );
  }

  return result;
}

/**
 * Gets a price list by ID, ensuring it belongs to the given organization.
 */
export async function getPriceListById(
  orgSlug: string,
  priceListId: string
): Promise<PriceList | null> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  // Fetch from the view for status
  const { data: viewData, error: viewError } = await supabase
    .from("price_lists_with_status")
    .select(
      `
      id,
      name,
      supplier_id,
      valid_from,
      status,
      supplier:suppliers!inner(name, organization_id)
    `
    )
    .eq("id", priceListId)
    .eq("supplier.organization_id", org.id)
    .maybeSingle();

  if (viewError) {
    throw new Error(`Error obteniendo lista de precios: ${viewError.message}`);
  }

  if (!viewData) {
    return null;
  }

  // Fetch additional metadata from base table
  const { data: metaData } = await supabase
    .from("price_lists")
    .select("created_at, updated_at")
    .eq("id", priceListId)
    .maybeSingle();

  const result: PriceList = {
    ...(viewData as Record<string, unknown>),
    supplier_name: (viewData as { supplier?: { name?: string } }).supplier
      ?.name,
    created_at: metaData?.created_at,
    updated_at: metaData?.updated_at,
  } as PriceList;

  return result;
}

export async function getPriceListItems(
  orgSlug: string,
  priceListId: string
): Promise<PriceListItem[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("price_list_items")
    .select(
      `
      *,
      product:products(name, sku, profit_margin, sale_price)
    `
    )
    .eq("price_list_id", priceListId);

  if (error) {
    throw new Error(
      `Error obteniendo items de la lista de precios: ${error.message}`
    );
  }

  const items = (data ?? []).map((item: unknown) => {
    const row = item as {
      cost_price?: number | null;
      product?: {
        name?: string;
        sku?: string;
        profit_margin?: number | null;
        sale_price?: number | null;
      };
    };

    const purchasePrice = row.cost_price ?? 0;
    const productMargin = row.product?.profit_margin ?? null;
    const calculatedSalePrice =
      typeof productMargin === "number"
        ? purchasePrice * (1 + productMargin / 100)
        : null;

    return {
      ...(item as Record<string, unknown>),
      product_name: row.product?.name,
      sku: row.product?.sku,
      price: purchasePrice,
      purchase_price: purchasePrice,
      product_margin: productMargin,
      calculated_sale_price: calculatedSalePrice,
    };
  }) as PriceListItem[];

  return items;
}

export type PriceListItemBasic = {
  productId: string;
  costPrice: number;
  margin: number | null;
};

/**
 * Fetches price list items for multiple price list IDs in a single query.
 * Returns a record keyed by price_list_id.
 */
export async function getPriceListItemsBatch(
  orgSlug: string,
  priceListIds: string[]
): Promise<Record<string, PriceListItemBasic[]>> {
  if (priceListIds.length === 0) {
    return {};
  }

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("price_list_items")
    .select(
      "price_list_id, product_id, cost_price, product:products(profit_margin)"
    )
    .in("price_list_id", priceListIds);

  if (error) {
    throw new Error(`Error obteniendo items: ${error.message}`);
  }

  const result: Record<string, PriceListItemBasic[]> = {};
  for (const item of data ?? []) {
    const row = item as {
      price_list_id: string;
      product_id: string;
      cost_price: number | null;
      product: { profit_margin: number | null } | null;
    };
    if (!result[row.price_list_id]) {
      result[row.price_list_id] = [];
    }
    result[row.price_list_id].push({
      productId: row.product_id,
      costPrice: row.cost_price ?? 0,
      margin: row.product?.profit_margin ?? null,
    });
  }
  return result;
}

/**
 * Updates a price list's editable fields (valid_from, name).
 */
export async function updatePriceList(
  input: UpdatePriceListInput
): Promise<PriceList> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (!(input.valid_from || input.name)) {
    throw new Error("Debe proporcionar al menos un campo para actualizar");
  }

  const supabase = await createClient();

  // Verify the price list belongs to this organization
  const { data: existingPriceList } = await supabase
    .from("price_lists")
    .select("organization_id")
    .eq("id", input.priceListId)
    .single();

  if (!existingPriceList) {
    throw new Error("Lista de precios no encontrada");
  }

  if (existingPriceList.organization_id !== org.id) {
    throw new Error("No tiene permisos para modificar esta lista de precios");
  }

  // Prepare update payload
  const updatePayload: {
    valid_from?: string;
    name?: string;
    updated_at: string;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (input.valid_from) {
    updatePayload.valid_from = input.valid_from;
  }

  if (input.name) {
    updatePayload.name = input.name;
  }

  // Update the price list
  const { data, error } = await supabase
    .from("price_lists")
    .update(updatePayload)
    .eq("id", input.priceListId)
    .select()
    .single();

  if (error) {
    throw new Error(`Error actualizando lista de precios: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo actualizar la lista de precios");
  }

  // Return the updated price list with status calculated
  const updatedPriceList = await getPriceListById(
    input.orgSlug,
    input.priceListId
  );

  if (!updatedPriceList) {
    throw new Error("Error obteniendo la lista de precios actualizada");
  }

  return updatedPriceList;
}

/**
 * Replaces an existing price list with a new one, migrating all
 * customer_supplier_assignments atomically via the replace_price_list RPC.
 * Only valid for Active lists — Scheduled lists cannot be replaced.
 */
export async function replacePriceList(
  orgSlug: string,
  oldListId: string,
  newListId: string
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc(
    "replace_price_list" as never,
    {
      p_old_list_id: oldListId,
      p_new_list_id: newListId,
      p_organization_id: org.id,
    } as never
  );

  if (error) {
    throw new Error(`Error al reemplazar la lista: ${error.message}`);
  }
}

async function deactivateOtherActivePriceLists(
  orgId: string,
  supplierId: string,
  newListId: string
): Promise<void> {
  const supabase = await createClient();

  const { data: others } = await supabase
    .from("price_lists")
    .select("id")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .neq("id", newListId)
    .eq("is_active", true)
    .is("replaced_by_list_id", null);

  if (!others?.length) {
    return;
  }

  await supabase
    .from("price_lists")
    .update({ replaced_by_list_id: newListId })
    .in(
      "id",
      others.map((l) => l.id)
    );
}
