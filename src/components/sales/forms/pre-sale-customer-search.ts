import type { Customer } from "@/modules/customers/types";

type SearchableCustomer = Pick<
  Customer,
  "fantasy_name" | "business_name" | "city" | "address"
>;

export const normalizePreSaleSearch = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Match both names and location, but put name matches ahead of address matches.
// cmdk's fuzzy sorting otherwise places the first customer outside the viewport.
export function searchPreSaleCustomers<T extends SearchableCustomer>(
  customers: T[],
  input: string
): T[] {
  const query = normalizePreSaleSearch(input);
  if (!query) {
    return customers;
  }
  const tokens = query.split(" ");

  return customers
    .map((customer) => {
      const names = [customer.fantasy_name, customer.business_name]
        .filter((name): name is string => Boolean(name))
        .map(normalizePreSaleSearch);
      const searchable = [...names, customer.city ?? "", customer.address ?? ""]
        .map(normalizePreSaleSearch)
        .join(" ");
      if (!tokens.every((token) => searchable.includes(token))) {
        return null;
      }
      let rank = 2;
      if (names.some((name) => name.startsWith(query))) {
        rank = 0;
      } else if (names.some((name) => name.includes(query))) {
        rank = 1;
      }
      return { customer, rank };
    })
    .filter((result): result is { customer: T; rank: number } =>
      Boolean(result)
    )
    .sort((a, b) => a.rank - b.rank)
    .map(({ customer }) => customer);
}
