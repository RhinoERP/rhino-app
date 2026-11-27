export type SearchableCatalogOption = {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
};

function normalizeSearch(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function filterSearchableCatalog(
  options: SearchableCatalogOption[],
  query: string,
  limit = 40
) {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return options.slice(0, limit);
  }
  return options
    .filter((option) => {
      const text = normalizeSearch(
        `${option.label} ${option.description ?? ""} ${option.searchText ?? ""}`
      );
      return tokens.every((token) => text.includes(token));
    })
    .slice(0, limit);
}
