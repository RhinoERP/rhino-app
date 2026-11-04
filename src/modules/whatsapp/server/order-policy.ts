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
const repeat = /\b(lo mismo|igual que|repetir|repeti|repetime|otra vez)\b/u;
const ambiguousReturn =
  /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|como estas|gracias|ok|si|dale|confirmo|listo|perfecto|genial)[\s!.,¿?]*$/u;
export function isPurchaseRequest(value: string | null): boolean {
  const text = normalizeOrderText(value);
  return purchase.test(text) && !informational.test(text);
}
export function isRepeatRequest(value: string | null): boolean {
  return repeat.test(normalizeOrderText(value));
}
export function isAmbiguousReturn(value: string | null): boolean {
  return ambiguousReturn.test(normalizeOrderText(value));
}
