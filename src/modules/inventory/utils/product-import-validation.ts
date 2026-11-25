import { normalizeTalleValue, normalizeVariantValue } from "./variant-utils";

type SupplierReference = { id: string; name: string };

export function resolveProductImportSupplier(
  value: unknown,
  suppliers: readonly SupplierReference[]
) {
  const name = String(value ?? "").trim();
  if (!name) {
    return { supplierId: undefined };
  }
  const matches = suppliers.filter(
    (supplier) => supplier.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (matches.length === 0) {
    return {
      error: `El proveedor "${name}" no existe. Crealo antes de importar.`,
    };
  }
  if (matches.length > 1) {
    return {
      error: `El proveedor "${name}" es ambiguo: hay más de una coincidencia.`,
    };
  }
  return { supplierId: matches[0].id };
}

export function resolveProductImportVariants(sizes: unknown, colors: unknown) {
  const rawSizes = String(sizes ?? "").trim();
  const rawColors = String(colors ?? "").trim();
  if (!(rawSizes && rawColors)) {
    return { hasVariants: false, talles: [], colores: [] };
  }
  if (typeof sizes === "number" && !Number.isInteger(sizes)) {
    return {
      error:
        "Excel guardó el talle como número decimal. Guardá la celda como texto para conservar listas como 0,1 u 8,9.",
    };
  }
  const talles = [
    ...new Set(rawSizes.split(",").map(normalizeTalleValue).filter(Boolean)),
  ];
  const colores = [
    ...new Set(rawColors.split(",").map(normalizeVariantValue).filter(Boolean)),
  ];
  if (talles.length === 0 || colores.length === 0) {
    return { error: "Las listas de talles y colores no pueden estar vacías." };
  }
  if (
    talles.some((value) => value.length > 50) ||
    colores.some((value) => value.length > 50)
  ) {
    return {
      error: "Cada talle y color debe tener como máximo 50 caracteres.",
    };
  }
  if (talles.length * colores.length > 1000) {
    return {
      error: "El producto admite hasta 1000 combinaciones de talle y color.",
    };
  }
  return { hasVariants: true, talles, colores };
}
