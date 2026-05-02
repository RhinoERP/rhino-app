import { downloadWorksheet } from "@/lib/excel-utils";

export type DirectSaleTemplateProduct = {
  id: string;
  sku: string;
  name: string;
  costPrice: number | null;
};

const DIRECT_SALE_TEMPLATE_HEADERS = [
  "ID",
  "SKU",
  "Producto",
  "Costo",
  "Precio Directo",
] as const;

const DIRECT_SALE_TEMPLATE_DESCRIPTIONS = [
  "No modificar. Se usa para validar el producto.",
  "Referencia del producto.",
  "Nombre actual del producto.",
  "Costo vigente de referencia.",
  "Completar con el precio fijo de Venta Directa.",
] as const;

function buildFilename(orgSlug: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `precios_venta_directa_${orgSlug}_${today}.xlsx`;
}

export async function exportDirectSaleTemplate(
  products: DirectSaleTemplateProduct[],
  orgSlug: string
): Promise<void> {
  await downloadWorksheet({
    filename: buildFilename(orgSlug),
    sheetName: "Precios venta directa",
    rows: [
      [...DIRECT_SALE_TEMPLATE_HEADERS],
      [...DIRECT_SALE_TEMPLATE_DESCRIPTIONS],
      ...products.map((product) => [
        product.id,
        product.sku,
        product.name,
        product.costPrice ?? "",
        "",
      ]),
    ],
    columns: [{ wch: 38 }, { wch: 18 }, { wch: 42 }, { wch: 16 }, { wch: 28 }],
  });
}

export const downloadDirectSalesTemplate = exportDirectSaleTemplate;
