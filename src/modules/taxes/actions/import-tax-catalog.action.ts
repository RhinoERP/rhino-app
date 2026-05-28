"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ARGENTINA_TAX_CATALOG } from "../argentina-catalog";

export type ImportTaxCatalogResult =
  | { success: true; imported: number; skipped: number }
  | { success: false; error: string };

/**
 * Imports selected catalog taxes for the organization.
 * Taxes already imported (by catalog_key) are silently skipped.
 */
export async function importTaxCatalogAction(
  orgSlug: string,
  catalogKeys: string[]
): Promise<ImportTaxCatalogResult> {
  if (!catalogKeys.length) {
    return { success: false, error: "Seleccioná al menos un impuesto." };
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return { success: false, error: "Organización no encontrada." };
    }

    const supabase = await createClient();

    // Find which catalog keys already exist for this org
    const { data: existing } = await supabase
      .from("taxes")
      .select("catalog_key")
      .eq("organization_id", org.id)
      .not("catalog_key", "is", null);

    const existingKeys = new Set(
      (existing ?? []).map((r) => r.catalog_key).filter(Boolean)
    );

    const toInsert = catalogKeys
      .filter((key) => !existingKeys.has(key))
      .flatMap((key) => {
        const catalogTax = ARGENTINA_TAX_CATALOG.find((t) => t.key === key);
        if (!catalogTax) {
          return [];
        }
        return [
          {
            organization_id: org.id,
            name: catalogTax.name,
            rate: catalogTax.rate,
            code: catalogTax.arcaCode,
            description: catalogTax.description,
            catalog_key: catalogTax.key,
            catalog_category: catalogTax.category,
            catalog_province: catalogTax.province,
            is_active: true,
            is_favorite: false,
            is_favorite_sales: false,
            is_favorite_direct_sales: false,
            is_favorite_credit_notes: false,
            is_favorite_debit_notes: false,
          },
        ];
      });

    const skipped = catalogKeys.length - toInsert.length;

    if (!toInsert.length) {
      return { success: true, imported: 0, skipped };
    }

    const { error } = await supabase.from("taxes").insert(toInsert);

    if (error) {
      return { success: false, error: `Error al importar: ${error.message}` };
    }

    return { success: true, imported: toInsert.length, skipped };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Module assignment toggle
// ─────────────────────────────────────────────────────────────────────────────

export type TaxModuleContext =
  | "sales"
  | "direct_sales"
  | "credit_notes"
  | "debit_notes";

const MODULE_FIELD: Record<
  TaxModuleContext,
  | "is_favorite_sales"
  | "is_favorite_direct_sales"
  | "is_favorite_credit_notes"
  | "is_favorite_debit_notes"
> = {
  sales: "is_favorite_sales",
  direct_sales: "is_favorite_direct_sales",
  credit_notes: "is_favorite_credit_notes",
  debit_notes: "is_favorite_debit_notes",
};

export type ToggleTaxModuleResult =
  | { success: true }
  | { success: false; error: string };

export async function toggleTaxModuleAssignmentAction(
  orgSlug: string,
  taxId: string,
  module: TaxModuleContext,
  enabled: boolean
): Promise<ToggleTaxModuleResult> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return { success: false, error: "Organización no encontrada." };
    }

    const supabase = await createClient();
    const field = MODULE_FIELD[module];

    const { error } = await supabase
      .from("taxes")
      .update({ [field]: enabled })
      .eq("id", taxId)
      .eq("organization_id", org.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado.",
    };
  }
}
