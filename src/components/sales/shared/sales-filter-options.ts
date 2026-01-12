import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import type { Option } from "@/types/data-table";

export function buildCustomerOptions(
  sales: SalesOrderWithCustomer[]
): Option[] {
  const customersMap = new Map<string, string>();

  for (const sale of sales) {
    if (!sale.customer?.id) {
      continue;
    }

    const name =
      sale.customer.fantasy_name ||
      sale.customer.business_name ||
      "Cliente desconocido";

    customersMap.set(sale.customer.id, name);
  }

  return Array.from(customersMap.entries())
    .map(([id, name]) => ({ label: name, value: id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildSellerOptions(sales: SalesOrderWithCustomer[]): Option[] {
  const sellersMap = new Map<string, string>();

  for (const sale of sales) {
    if (!sale.seller?.id) {
      continue;
    }

    const label =
      sale.seller.name || sale.seller.email || "Vendedor sin nombre";
    sellersMap.set(sale.seller.id, label);
  }

  return Array.from(sellersMap.entries())
    .map(([id, label]) => ({ label, value: id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
