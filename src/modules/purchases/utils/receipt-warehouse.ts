export type ReceiptWarehouseContext = {
  warehouses: Array<{ id: string; name: string }>;
  lockedWarehouse: { id: string; name: string } | null;
};

export function resolveReceiptWarehouseId(
  context: ReceiptWarehouseContext,
  requestedWarehouseId?: string
): string {
  if (
    context.lockedWarehouse &&
    requestedWarehouseId &&
    requestedWarehouseId !== context.lockedWarehouse.id
  ) {
    throw new Error("La recepción debe usar el depósito del pedido");
  }
  const id =
    context.lockedWarehouse?.id ??
    requestedWarehouseId ??
    (context.warehouses.length === 1 ? context.warehouses[0].id : undefined);
  const warehouse = context.warehouses.find((row) => row.id === id);
  if (!warehouse) {
    throw new Error(
      "Seleccioná un depósito de recepción habilitado para tu usuario"
    );
  }
  return warehouse.id;
}

export function resolveReceiptRetryWarehouseId(
  recordedWarehouseId: string | null,
  requestedWarehouseId?: string
): string {
  if (!recordedWarehouseId) {
    throw new Error("La recepción registrada no tiene depósito");
  }
  if (requestedWarehouseId && requestedWarehouseId !== recordedWarehouseId) {
    throw new Error(
      "No se puede cambiar el depósito de una recepción registrada"
    );
  }
  return recordedWarehouseId;
}
