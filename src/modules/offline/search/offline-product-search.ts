type SearchableOfflineProduct = {
  name: string;
  sku: string;
  brand?: string | null;
  supplierName?: string | null;
  categoryName?: string | null;
};

const WHITESPACE_REGEX = /\s+/;

export const OFFLINE_PRODUCT_SEARCH_DEFAULT_LIMIT = 12;
export const OFFLINE_PRODUCT_SEARCH_LIMIT = 30;

export function normalizeOfflineProductQuery(value: string): string[] {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(WHITESPACE_REGEX)
    .filter(Boolean);
}

/** Matches every query token and ranks SKU/name hits above catalog metadata. */
export function searchOfflineProducts<T extends SearchableOfflineProduct>(
  products: T[],
  query: string
): T[] {
  const tokens = normalizeOfflineProductQuery(query);
  if (tokens.length === 0) {
    return products;
  }

  const normalizedQuery = tokens.join(" ");
  return products
    .map((product, index) => {
      const name = normalizeOfflineProductQuery(product.name).join(" ");
      const sku = normalizeOfflineProductQuery(product.sku).join(" ");
      const metadata = normalizeOfflineProductQuery(
        [product.brand, product.supplierName, product.categoryName]
          .filter(Boolean)
          .join(" ")
      ).join(" ");
      const searchable = `${name} ${sku} ${metadata}`;
      if (!tokens.every((token) => searchable.includes(token))) {
        return null;
      }

      let rank = 5;
      if (sku === normalizedQuery) {
        rank = 0;
      } else if (sku.startsWith(normalizedQuery)) {
        rank = 1;
      } else if (name.startsWith(normalizedQuery)) {
        rank = 2;
      } else if (name.includes(normalizedQuery)) {
        rank = 3;
      } else if (tokens.every((token) => `${name} ${sku}`.includes(token))) {
        rank = 4;
      }

      return { index, product, rank };
    })
    .filter((result): result is { index: number; product: T; rank: number } =>
      Boolean(result)
    )
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ product }) => product);
}
