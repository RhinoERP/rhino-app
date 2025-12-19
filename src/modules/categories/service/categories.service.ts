import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Category } from "../types";

export type CreateCategoryInput = {
  orgSlug: string;
  name: string;
  parent_id?: string | null;
};

export type UpdateCategoryInput = Omit<CreateCategoryInput, "orgSlug">;

export async function getCategoriesByOrgSlug(
  orgSlug: string
): Promise<Category[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error al obtener categorías: ${error.message}`);
  }

  return data ?? [];
}

export async function createCategoryForOrg(
  input: CreateCategoryInput
): Promise<Category> {
  if (!input.name?.trim()) {
    throw new Error("El nombre de la categoría es requerido");
  }

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .insert({
      organization_id: org.id,
      name: input.name.trim(),
      parent_id: input.parent_id || null,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo crear la categoría: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo crear la categoría");
  }

  return data;
}

/**
 * Gets a category by ID.
 */
export async function getCategoryById(
  categoryId: string
): Promise<Category | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error al obtener la categoría: ${error.message}`);
  }

  return data;
}

/**
 * Updates a category by ID.
 */
export async function updateCategoryById(
  categoryId: string,
  input: Omit<CreateCategoryInput, "orgSlug">
): Promise<Category> {
  if (!input.name?.trim()) {
    throw new Error("El nombre de la categoría es requerido");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .update({
      name: input.name.trim(),
      parent_id: input.parent_id || null,
    })
    .eq("id", categoryId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo actualizar la categoría: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo actualizar la categoría");
  }

  return data;
}

/**
 * Deletes a category by ID.
 */
export async function deleteCategoryById(categoryId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    throw new Error(`No se pudo eliminar la categoría: ${error.message}`);
  }
}
