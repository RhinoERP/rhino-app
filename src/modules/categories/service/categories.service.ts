import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Category, CategoryAccountingRule } from "../types";

export type CreateCategoryInput = {
  orgSlug: string;
  name: string;
  parent_id?: string | null;
  accountingAccountCode?: string | null;
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

  const categories = data ?? [];

  if (categories.length === 0) {
    return [];
  }

  const rules = await getCategoryAccountingRulesByOrgId(
    org.id,
    categories.map((category) => category.id)
  );
  const ruleByCategoryId = new Map(
    rules.map((rule) => [rule.categoryId, rule.accountCode])
  );

  return categories.map((category) => ({
    ...category,
    accountingAccountCode: ruleByCategoryId.get(category.id) ?? null,
  }));
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

async function getCategoryAccountingRulesByOrgId(
  orgId: string,
  categoryIds: string[]
): Promise<CategoryAccountingRule[]> {
  if (categoryIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("category_accounting_rules" as never)
    .select("category_id, account_code")
    .eq("organization_id", orgId)
    .in("category_id", categoryIds);

  if (error) {
    throw new Error(
      `Error al obtener reglas contables de categorías: ${error.message}`
    );
  }

  const rows = (
    (data ?? []) as Array<{
      category_id: string;
      account_code: string;
    }>
  ).map((rule) => ({
    categoryId: rule.category_id,
    accountCode: rule.account_code,
  }));

  return rows;
}

export async function getCategoryAccountingRules(
  orgSlug: string,
  categoryIds: string[]
): Promise<CategoryAccountingRule[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  return getCategoryAccountingRulesByOrgId(org.id, categoryIds);
}

export async function upsertCategoryAccountingRule(
  orgSlug: string,
  categoryId: string,
  accountCode: string | null | undefined
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const normalizedAccountCode = accountCode?.trim() || null;
  const supabase = await createClient();

  if (!normalizedAccountCode) {
    const { error: deleteError } = await supabase
      .from("category_accounting_rules" as never)
      .delete()
      .eq("organization_id", org.id)
      .eq("category_id", categoryId);

    if (deleteError) {
      throw new Error(
        `No se pudo eliminar la regla contable de la categoría: ${deleteError.message}`
      );
    }

    return;
  }

  const { error } = await supabase
    .from("category_accounting_rules" as never)
    .upsert(
      {
        organization_id: org.id,
        category_id: categoryId,
        account_code: normalizedAccountCode,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "organization_id,category_id" }
    );

  if (error) {
    throw new Error(
      `No se pudo guardar la regla contable de la categoría: ${error.message}`
    );
  }
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
