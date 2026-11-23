const accents = /[\u0300-\u036f]/g;
export function normalizeOrderText(value: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(accents, "")
    .toLowerCase()
    .trim();
}
const purchase =
  /\b(quiero|quisiera|necesito|comprar|compro|llevo|dame|mandame|pedir|encargar|arma|nuevo pedido|otro pedido|repetir|repetime)\b/u;
const informational = /\b(saber|consultar|averiguar)\b/u;
const refusedPurchase =
  /\b(?:no|nunca|jamas)\s+(?:(?:me|nos)\s+)?(?:quiero|quisiera|queremos|necesito|necesitamos|deseo|compro|llevo|mandes|envies|armes|hagas|prepares|repitas|(?:voy|vamos|puedo|podemos)\s+(?:a\s+)?(?:comprar|pedir|encargar|llevar))\b/u;
const deferredPurchase =
  /^(?:no ahora|ahora no|todavia no|aun no|por ahora no)$/u;
const intentClauseSeparator = /[.!?;,\n]|\b(?:pero|sino)\b/u;
const repeat = /\b(lo mismo|igual que|repetir|repeti|repetime|otra vez)\b/u;
const ambiguousReturn =
  /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|como estas|gracias|ok|si|dale|confirmo|listo|perfecto|genial)[\s!.,¿?]*$/u;
export function isPurchaseRequest(value: string | null): boolean {
  const text = normalizeOrderText(value);
  if (informational.test(text)) {
    return false;
  }
  // A later explicit choice can replace a rejection ("no quiero jamón, quiero
  // queso"). An unrelated "no tengo" must not negate the subsequent purchase.
  const intent = text
    .split(intentClauseSeparator)
    .reverse()
    .find(
      (clause) =>
        purchase.test(clause) ||
        refusedPurchase.test(clause) ||
        deferredPurchase.test(clause.trim())
    );
  return Boolean(
    intent && purchase.test(intent) && !refusedPurchase.test(intent)
  );
}
export function isRepeatRequest(value: string | null): boolean {
  return repeat.test(normalizeOrderText(value));
}
export function isAmbiguousReturn(value: string | null): boolean {
  return ambiguousReturn.test(normalizeOrderText(value));
}
