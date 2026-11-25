type WarehouseIdentity = { id: string; name: string };

export function resolveImportWarehouse(
  warehouses: WarehouseIdentity[],
  row: { warehouse_id?: unknown; warehouse?: unknown }
): string {
  const id = String(row.warehouse_id ?? "").trim();
  const name = String(row.warehouse ?? "")
    .trim()
    .toLocaleLowerCase();
  if (id) {
    const warehouse = warehouses.find((candidate) => candidate.id === id);
    if (
      !warehouse ||
      (name && warehouse.name.trim().toLocaleLowerCase() !== name)
    ) {
      throw new Error(
        "El ID de depósito no está habilitado o no coincide con su nombre"
      );
    }
    return warehouse.id;
  }
  if (name) {
    const matches = warehouses.filter(
      (candidate) => candidate.name.trim().toLocaleLowerCase() === name
    );
    if (matches.length !== 1) {
      throw new Error(
        "Depósito inexistente, no habilitado o ambiguo; indicá su ID"
      );
    }
    return matches[0].id;
  }
  if (warehouses.length === 1) {
    return warehouses[0].id;
  }
  throw new Error("Indicá el depósito para esta fila de stock");
}

export function resolveImportVariant(
  variants: Array<{ id: string; talle: string; color: string }>,
  row: { talle?: unknown; color?: unknown }
): string {
  const talle = String(row.talle ?? "")
    .trim()
    .toLocaleLowerCase();
  const color = String(row.color ?? "")
    .trim()
    .toLocaleLowerCase();
  const matches = variants.filter(
    (variant) =>
      variant.talle.trim().toLocaleLowerCase() === talle &&
      variant.color.trim().toLocaleLowerCase() === color
  );
  if (!(talle && color) || matches.length !== 1) {
    throw new Error("Indicá talle y color de una variante válida del producto");
  }
  return matches[0].id;
}
