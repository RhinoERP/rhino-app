const accentMark = /[\u0300-\u036f]/g;
const explicitConfirmation =
  /^(si(?:,? confirmo)?|confirmo|confirmar|acepto|dale(?:,? avancemos)?|ok|okay|procedamos|avancemos|lo quiero|quiero comprar|de acuerdo)[!. ]*$/;

/** Only an unconditional answer can authorize the specific pending action. */
export function isExplicitConfirmation(value: string | null): boolean {
  return explicitConfirmation.test(
    (value ?? "")
      .trim()
      .toLocaleLowerCase("es-AR")
      .normalize("NFD")
      .replace(accentMark, "")
  );
}
