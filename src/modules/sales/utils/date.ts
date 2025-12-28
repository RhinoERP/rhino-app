/**
 * Returns a YYYY-MM-DD string using local date parts (no timezone shifting).
 */
export function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateParts(dateString: string): [number, number, number] | null {
  const [year, month, day] =
    dateString.split("T")[0]?.split("-")?.map(Number) ?? [];
  if (!(year && month && day)) {
    return null;
  }
  return [year, month, day];
}

/**
 * Adds days to a YYYY-MM-DD string without timezone drift.
 */
export function addDays(dateString: string, days: number): string {
  const parts = parseDateParts(dateString);

  if (!parts) {
    return dateString;
  }

  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

/**
 * Derives a due date using the provided expiration or credit days.
 */
export function computeDueDate(
  saleDate: string,
  expirationDate?: string | null,
  creditDays?: number | null
): string {
  if (expirationDate) {
    return expirationDate;
  }

  if (creditDays && creditDays > 0) {
    return addDays(saleDate, creditDays);
  }

  return saleDate;
}
