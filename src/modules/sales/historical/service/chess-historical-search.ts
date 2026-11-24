const MAX_SEARCH_LENGTH = 100;

export function normalizeHistoricalSearch(rawSearch: string): string {
  return rawSearch.trim().slice(0, MAX_SEARCH_LENGTH);
}

export function quotePostgrestFilterValue(value: string): string {
  const escapedValue = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escapedValue}"`;
}

export function buildHistoricalTextSearchConditions(search: string): string[] {
  const pattern = quotePostgrestFilterValue(`%${search}%`);
  return [`printed_number.ilike.${pattern}`, `document_code.ilike.${pattern}`];
}
