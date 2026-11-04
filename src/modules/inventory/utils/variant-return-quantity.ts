export function hasFractionalVariantReturn(params: {
  variantId: string | null | undefined;
  quantity: number;
  unitQuantity?: number | null;
}): boolean {
  if (!params.variantId) {
    return false;
  }

  return (
    !Number.isSafeInteger(params.quantity) ||
    (params.unitQuantity != null && !Number.isSafeInteger(params.unitQuantity))
  );
}
