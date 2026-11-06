"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createProductForOrg } from "@/modules/inventory/service/inventory.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { ProductWithPrice } from "../service/purchases.service";

const inputSchema = z.object({
  orgSlug: z.string().min(1),
  supplierId: z.uuid(),
  name: z.string().trim().min(1, "Poné el nombre del producto.").max(200),
  sku: z.string().trim().min(1, "Poné un código (SKU).").max(100),
  brand: z.string().trim().max(100).optional(),
  unit_of_measure: z.enum(["UN", "KG", "LT", "MT"]),
  weight_per_unit: z.number().positive().nullable(),
  units_per_box: z.number().int().positive().nullable(),
  /** Alícuota de IVA de la línea, para asignarle el impuesto al producto. */
  vatRate: z.number().nullable(),
});

export type CreateProductFromInvoiceInput = z.infer<typeof inputSchema>;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Los impuestos de IVA de la organización con esa alícuota. */
async function vatTaxIds(
  supabase: Supabase,
  organizationId: string,
  rate: number | null
): Promise<string[]> {
  if (rate === null) {
    return [];
  }
  const { data } = await supabase
    .from("taxes")
    .select("id, name, rate")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  return (data ?? [])
    .filter(
      (tax) =>
        tax.name.toLowerCase().includes("iva") &&
        !tax.name.toLowerCase().includes("percep") &&
        Number(tax.rate) === rate
    )
    .map((tax) => tax.id);
}

/**
 * Da de alta el producto de una línea de la factura que no existe en Rhinos,
 * ya asignado al proveedor, y lo devuelve listo para usar en la compra.
 */
export async function createProductFromInvoiceAction(
  input: CreateProductFromInvoiceInput
): Promise<
  | { success: true; product: ProductWithPrice }
  | { success: false; error: string }
> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datos del producto inválidos.",
    };
  }
  const data = parsed.data;
  await ensure("inventory.manage", data.orgSlug);
  const org = await getOrganizationBySlug(data.orgSlug);
  if (!org?.id) {
    return { success: false, error: "No se encontró la organización." };
  }
  const supabase = await createClient();
  const byWeight =
    (data.unit_of_measure === "KG" || data.unit_of_measure === "LT") &&
    Boolean(data.weight_per_unit);

  try {
    const created = await createProductForOrg({
      orgSlug: data.orgSlug,
      name: data.name,
      sku: data.sku,
      brand: data.brand || undefined,
      supplier_id: data.supplierId,
      unit_of_measure: data.unit_of_measure,
      weight_per_unit: data.weight_per_unit ?? undefined,
      units_per_box: data.units_per_box ?? undefined,
      tracks_stock_units: byWeight,
      tax_ids: await vatTaxIds(supabase, org.id, data.vatRate),
    });
    const { data: row } = await supabase
      .from("products_with_price")
      .select("*")
      .eq("id", created.id)
      .single();
    if (!row) {
      return {
        success: false,
        error: "El producto se creó, pero no lo pude traer. Recargá la página.",
      };
    }
    revalidatePath(`/org/${data.orgSlug}/stock`);
    return { success: true, product: { ...row, has_variants: false } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo crear el producto.",
    };
  }
}
