export const posSaleReturnableItemsQueryKey = (
  orgSlug: string,
  posSaleId: string
) => ["pos-sale-returnable-items", orgSlug, posSaleId] as const;
