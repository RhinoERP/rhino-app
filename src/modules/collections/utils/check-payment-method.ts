/** Cheques vinculados a cobranzas/pagos se gestionan desde Tesorería. */
export function isCheckPaymentMethod(
  method: string | null | undefined
): boolean {
  return (
    method === "cheque" || method === "e-cheq" || method === "cheque_endosado"
  );
}
