"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type UpdateProductFlowInput = {
  orgSlug: string;
  productId: string;
  can_sell: boolean;
  can_buy: boolean;
  can_produce: boolean;
  accounting_account_code: string | null;
  accounting_account_name: string | null;
};

type CloneProductInput = {
  orgSlug: string;
  sourceProductId: string;
  newSku: string;
  newName: string;
};

export async function updateProductFlowAction(
  input: UpdateProductFlowInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    const org = await getOrganizationBySlug(input.orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("products")
      .update({
        can_sell: input.can_sell,
        can_buy: input.can_buy,
        can_produce: input.can_produce,
        accounting_account_code: input.accounting_account_code,
        accounting_account_name: input.accounting_account_name,
        updated_at: new Date().toISOString(),
      } as never) // cast temporal hasta que se regeneren los tipos de Supabase
      .eq("id", input.productId)
      .eq("organization_id", org.id);

    if (error) {
      throw error;
    }

    revalidatePath(`/org/${input.orgSlug}/stock/${input.productId}`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function cloneProductAction(
  input: CloneProductInput
): Promise<{ success: boolean; error?: string; newProductId?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    const org = await getOrganizationBySlug(input.orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    const supabase = await createClient();

    // 1. Obtener el producto fuente
    const { data: source, error: fetchError } = await supabase
      .from("products")
      .select("*")
      .eq("id", input.sourceProductId)
      .eq("organization_id", org.id)
      .single();

    if (fetchError || !source) {
      return { success: false, error: "Producto fuente no encontrado" };
    }

    // 2. Clonar con nuevo SKU y nombre, manteniendo el parent_id del original
    //    (si el original es un hijo, el clon también lo es de ese padre)
    const { data: newProduct, error: insertError } = await supabase
      .from("products")
      .insert({
        organization_id: org.id,
        name: input.newName,
        sku: input.newSku,
        brand: source.brand,
        description: source.description,
        category_id: source.category_id,
        supplier_id: source.supplier_id,
        unit_of_measure: source.unit_of_measure,
        units_per_box: source.units_per_box,
        boxes_per_pallet: source.boxes_per_pallet,
        weight_per_unit: source.weight_per_unit,
        min_stock: source.min_stock,
        profit_margin: source.profit_margin,
        tracks_stock_units: source.tracks_stock_units,
        variant_attributes: source.variant_attributes,
        // Vinculación contable heredada
        accounting_account_code: (source as never as Record<string, unknown>)
          .accounting_account_code as string | null,
        accounting_account_name: (source as never as Record<string, unknown>)
          .accounting_account_name as string | null,
        // Toggles heredados
        can_sell:
          ((source as never as Record<string, unknown>).can_sell as boolean) ??
          true,
        can_buy:
          ((source as never as Record<string, unknown>).can_buy as boolean) ??
          true,
        can_produce:
          ((source as never as Record<string, unknown>)
            .can_produce as boolean) ?? false,
        // El clon usa el ID del original como parent_id para agrupar la familia
        parent_id: source.parent_id ?? source.id,
        is_active: true,
      } as never)
      .select("id")
      .single();

    if (insertError || !newProduct) {
      return {
        success: false,
        error: insertError?.message ?? "Error al clonar",
      };
    }

    revalidatePath(`/org/${input.orgSlug}/stock`);
    return { success: true, newProductId: newProduct.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
