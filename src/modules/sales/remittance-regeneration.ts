export type AuthorizedSaleRemittanceRegenerationParams = {
  orgSlug: string;
  orgId: string;
  saleId: string;
};

type RegenerateRemittances = (
  params: AuthorizedSaleRemittanceRegenerationParams
) => Promise<void>;

export async function regenerateAuthorizedSaleRemittances(
  params: AuthorizedSaleRemittanceRegenerationParams,
  regenerators: {
    childOrderRemittances: RegenerateRemittances;
    saleRemittance: RegenerateRemittances;
  }
): Promise<void> {
  try {
    await Promise.all([
      regenerators.childOrderRemittances(params),
      regenerators.saleRemittance(params),
    ]);
  } catch (error) {
    console.error(
      "No se pudieron regenerar los remitos luego de autorizar la factura",
      error
    );
  }
}
