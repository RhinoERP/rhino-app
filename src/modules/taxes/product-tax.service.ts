import type { createClient } from "@/lib/supabase/server";
import { normalizeArcaTaxCode } from "@/modules/arca/tax-codes";
import type { ItemTaxInput } from "./item-tax-calculations";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getProductTaxAssignments(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  productIds: string[];
}): Promise<Map<string, ItemTaxInput[]>> {
  const productIds = Array.from(new Set(params.productIds.filter(Boolean)));
  const taxesByProductId = new Map<string, ItemTaxInput[]>();

  if (productIds.length === 0) {
    return taxesByProductId;
  }

  const { data, error } = await params.supabase
    .from("product_tax_assignments" as never)
    .select("product_id, tax:taxes(id, name, rate, code, is_active)")
    .eq("organization_id", params.orgId)
    .in("product_id", productIds);

  if (error) {
    throw new Error(
      `No se pudieron obtener los impuestos por producto: ${error.message}`
    );
  }

  for (const row of (data ?? []) as Array<{
    product_id?: string | null;
    tax?:
      | {
          id?: string | null;
          name?: string | null;
          rate?: number | null;
          code?: string | null;
          is_active?: boolean | null;
        }
      | Array<{
          id?: string | null;
          name?: string | null;
          rate?: number | null;
          code?: string | null;
          is_active?: boolean | null;
        }>
      | null;
  }>) {
    const productId = row.product_id;
    const tax = Array.isArray(row.tax) ? row.tax[0] : row.tax;

    if (!(productId && tax?.id && tax.name && tax.is_active !== false)) {
      continue;
    }

    const existing = taxesByProductId.get(productId) ?? [];
    existing.push({
      taxId: tax.id,
      name: tax.name,
      rate: Number(tax.rate ?? 0),
      taxCodeSnapshot: normalizeArcaTaxCode(tax.code) ?? null,
      source: "product",
    });
    taxesByProductId.set(productId, existing);
  }

  return taxesByProductId;
}

export function mapProductTaxesToLines<T extends { productId?: string | null }>(
  lines: T[],
  taxesByProductId: Map<string, ItemTaxInput[]>
): Array<T & { taxes?: ItemTaxInput[] }> {
  return lines.map((line) => {
    const productId = line.productId ?? null;
    const taxes = productId ? taxesByProductId.get(productId) : undefined;

    return taxes?.length ? { ...line, taxes } : line;
  });
}
