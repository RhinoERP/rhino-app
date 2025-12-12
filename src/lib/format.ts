export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {}
) {
  if (!date) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: opts.month ?? "long",
      day: opts.day ?? "numeric",
      year: opts.year ?? "numeric",
      ...opts,
    }).format(new Date(date));
  } catch (_err) {
    return "";
  }
}

export function formatCurrency(
  value: number | undefined | null,
  currency = "ARS"
): string {
  if (value === undefined || value === null) {
    return "—";
  }

  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(value);
  } catch (_err) {
    return `$ ${value.toFixed(2)}`;
  }
}
