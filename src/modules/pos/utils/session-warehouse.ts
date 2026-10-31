export function resolveSessionWarehouseId(
  warehouses: ReadonlyArray<{ id: string }>,
  requestedWarehouseId?: string
): string {
  const selected =
    requestedWarehouseId ??
    (warehouses.length === 1 ? warehouses[0].id : undefined);
  const warehouse = warehouses.find((row) => row.id === selected);
  if (!warehouse) {
    throw new Error("Seleccioná un depósito habilitado para abrir la caja");
  }
  return warehouse.id;
}
