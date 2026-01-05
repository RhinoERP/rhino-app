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

/**
 * Formats a date string (YYYY-MM-DD) without timezone conversion.
 * Useful for date-only values that should not be affected by timezone offsets.
 * @param dateString - Date string in YYYY-MM-DD format
 * @param formatStr - Format string (e.g., "dd/MM/yyyy")
 * @returns Formatted date string
 */
export function formatDateOnly(
  dateString: string,
  formatStr = "dd/MM/yyyy"
): string {
  if (!dateString) {
    return "";
  }

  try {
    // Parse the date components directly to avoid timezone issues
    const [year, month, day] = dateString.split("T")[0].split("-").map(Number);

    // Create a date in local timezone
    const date = new Date(year, month - 1, day);

    // Simple formatting for dd/MM/yyyy
    if (formatStr === "dd/MM/yyyy") {
      const d = String(date.getDate()).padStart(2, "0");
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const y = date.getFullYear();
      return `${d}/${m}/${y}`;
    }

    // For other formats, you can extend this
    return date.toLocaleDateString("es-AR");
  } catch (_err) {
    return dateString;
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

export function formatPercentage(
  value: number | undefined | null,
  decimals = 2
): string {
  if (value === undefined || value === null) {
    return "—";
  }

  return `${value.toFixed(decimals)}%`;
}
