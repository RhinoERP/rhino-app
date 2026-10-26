const accentMark = /[\u0300-\u036f]/g;
const explicitConfirmation =
  /^(si|confirmo|confirmar|acepto|dale|ok|okay|procedamos|avancemos|lo quiero|quiero comprar)(\b|[!. ,])/;

/** El agente no puede crear una preventa ante una frase ambigua. */
export function isExplicitConfirmation(value: string | null): boolean {
  const normalized = (value ?? "")
    .trim()
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(accentMark, "");

  return explicitConfirmation.test(normalized);
}
