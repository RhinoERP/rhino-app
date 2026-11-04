export function alignInsertedPosSaleItems<
  T extends { id: string; product_id: string | null; lot_id: string | null },
>(params: {
  itemPlans: Array<{
    payload: {
      id?: string;
      product_id: string | null;
      lot_id?: string | null;
    };
  }>;
  insertedItems: T[];
}): T[] {
  if (params.insertedItems.length !== params.itemPlans.length) {
    throw new Error("No se pudieron vincular todos los ítems POS insertados.");
  }

  const insertedItemsById = new Map(
    params.insertedItems.map((item) => [item.id, item])
  );

  return params.itemPlans.map((plan) => {
    const insertedItem = plan.payload.id
      ? insertedItemsById.get(plan.payload.id)
      : null;
    if (
      !insertedItem ||
      insertedItem.product_id !== plan.payload.product_id ||
      insertedItem.lot_id !== plan.payload.lot_id
    ) {
      throw new Error("No se pudo vincular un ítem POS insertado.");
    }
    return insertedItem;
  });
}
