import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Tax, TaxFavoriteContext } from "@/modules/taxes/types";
import type { Database } from "@/types/supabase";

export type { Tax, TaxFavoriteContext } from "@/modules/taxes/types";

export type CreateTaxInput = {
  orgSlug: string;
  name: string;
  rate: number;
  code?: string | null;
  description?: string | null;
  is_favorite_sales?: boolean;
  is_favorite_direct_sales?: boolean;
};

export type UpdateTaxInput = {
  name: string;
  rate: number;
  code?: string | null;
  description?: string | null;
  is_favorite_sales?: boolean;
  is_favorite_direct_sales?: boolean;
};

const favoriteFieldByContext: Record<TaxFavoriteContext, "is_favorite_sales"> =
  {
    sales: "is_favorite_sales",
  };

/**
 * Returns all active taxes for a specific organization
 */
export async function getActiveTaxesByOrgSlug(orgSlug: string): Promise<Tax[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("taxes")
    .select("*")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Error al obtener impuestos: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Returns all taxes for a specific organization (including inactive ones)
 */
export async function getAllTaxesByOrgSlug(orgSlug: string): Promise<Tax[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("taxes")
    .select("*")
    .eq("organization_id", org.id)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Error al obtener impuestos: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Returns all active taxes for any organization the user can access.
 *
 * @deprecated Prefer `getActiveTaxesByOrgSlug` to avoid cross-org results.
 */
export async function getActiveTaxes(): Promise<Tax[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("taxes")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Error al obtener impuestos: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Returns all taxes for any organization the user can access.
 *
 * @deprecated Prefer `getAllTaxesByOrgSlug` to avoid cross-org results.
 */
export async function getAllTaxes(): Promise<Tax[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("taxes")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Error al obtener impuestos: ${error.message}`);
  }

  return data ?? [];
}

export async function createTaxForOrg(input: CreateTaxInput): Promise<Tax> {
  if (!input.name?.trim()) {
    throw new Error("El nombre del impuesto es requerido");
  }

  if (input.rate === null || input.rate === undefined) {
    throw new Error("La tasa del impuesto es requerida");
  }

  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("La tasa del impuesto debe ser un número válido");
  }

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("taxes")
    .insert({
      organization_id: org.id,
      name: input.name.trim(),
      rate,
      code: input.code?.trim() || null,
      description: input.description?.trim() || null,
      is_favorite_sales: input.is_favorite_sales ?? false,
      is_favorite_direct_sales: input.is_favorite_direct_sales ?? false,
      is_active: true,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo crear el impuesto: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo crear el impuesto");
  }

  return data;
}

export async function updateTaxById(
  taxId: string,
  input: UpdateTaxInput
): Promise<Tax> {
  if (!input.name?.trim()) {
    throw new Error("El nombre del impuesto es requerido");
  }

  if (input.rate === null || input.rate === undefined) {
    throw new Error("La tasa del impuesto es requerida");
  }

  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("La tasa del impuesto debe ser un número válido");
  }

  const supabase = await createClient();

  const updatePayload: Database["public"]["Tables"]["taxes"]["Update"] = {
    name: input.name.trim(),
    rate,
  };

  if (input.code !== undefined) {
    updatePayload.code = input.code?.trim() || null;
  }

  if (input.description !== undefined) {
    updatePayload.description = input.description?.trim() || null;
  }

  if (typeof input.is_favorite_sales === "boolean") {
    updatePayload.is_favorite_sales = input.is_favorite_sales;
  }

  if (typeof input.is_favorite_direct_sales === "boolean") {
    updatePayload.is_favorite_direct_sales = input.is_favorite_direct_sales;
  }

  const { data, error } = await supabase
    .from("taxes")
    .update(updatePayload)
    .eq("id", taxId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo actualizar el impuesto: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo actualizar el impuesto");
  }

  return data;
}

export async function deactivateTaxById(taxId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("taxes")
    .update({
      is_active: false,
    })
    .eq("id", taxId);

  if (error) {
    throw new Error(`No se pudo eliminar el impuesto: ${error.message}`);
  }
}

export async function setTaxFavoriteById(
  taxId: string,
  context: TaxFavoriteContext,
  isFavorite: boolean
): Promise<Tax> {
  const supabase = await createClient();
  const favoriteField = favoriteFieldByContext[context];
  const updatePayload: Database["public"]["Tables"]["taxes"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  updatePayload[favoriteField] = isFavorite;

  if (isFavorite) {
    const { data: currentTax, error: currentTaxError } = await supabase
      .from("taxes")
      .select("organization_id")
      .eq("id", taxId)
      .maybeSingle();

    if (currentTaxError) {
      throw new Error(
        `No se pudo validar el impuesto favorito: ${currentTaxError.message}`
      );
    }

    if (currentTax?.organization_id) {
      const { error: clearFavoritesError } = await supabase
        .from("taxes")
        .update({
          [favoriteField]: false,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", currentTax.organization_id)
        .neq("id", taxId);

      if (clearFavoritesError) {
        throw new Error(
          `No se pudieron limpiar favoritos previos: ${clearFavoritesError.message}`
        );
      }
    }
  }

  const { data, error } = await supabase
    .from("taxes")
    .update(updatePayload)
    .eq("id", taxId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo actualizar favorito: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo actualizar favorito del impuesto");
  }

  return data;
}
