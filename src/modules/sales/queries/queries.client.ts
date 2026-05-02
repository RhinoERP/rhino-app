import type { Customer } from "@/modules/customers/types";
import type { SalesOrderWithCustomer } from "../service/sales.service";
import type { DirectSaleProduct, DirectSaleTerminal } from "../types";
import {
  directSaleCustomersQueryKey,
  directSaleProductsQueryKey,
  directSaleTerminalsQueryKey,
  salesQueryKey,
} from "./query-keys";

export const salesClientQueryOptions = (orgSlug: string) => ({
  queryKey: salesQueryKey(orgSlug),
  queryFn: async (): Promise<SalesOrderWithCustomer[]> => {
    const res = await fetch(`/api/org/${orgSlug}/ventas`);
    if (!res.ok) {
      throw new Error("Error al obtener ventas");
    }
    return res.json();
  },
});

export const directSaleProductsClientQueryOptions = (params: {
  orgSlug: string;
  search: string;
  limit?: number;
}) => {
  const { orgSlug, search, limit = 20 } = params;

  return {
    queryKey: directSaleProductsQueryKey(orgSlug, search, limit),
    queryFn: async (): Promise<DirectSaleProduct[]> => {
      const urlParams = new URLSearchParams();
      const normalizedSearch = search.trim();

      if (normalizedSearch) {
        urlParams.set("q", normalizedSearch);
      }

      urlParams.set("limit", String(limit));

      const res = await fetch(
        `/api/org/${orgSlug}/venta-directa/productos?${urlParams.toString()}`
      );

      if (!res.ok) {
        throw new Error("No se pudieron obtener productos para venta directa.");
      }

      return res.json();
    },
    staleTime: 30_000,
  };
};

export const directSaleTerminalsClientQueryOptions = (orgSlug: string) => ({
  queryKey: directSaleTerminalsQueryKey(orgSlug),
  queryFn: async (): Promise<DirectSaleTerminal[]> => {
    const res = await fetch(`/api/org/${orgSlug}/configuracion/pos-terminals`);

    if (!res.ok) {
      throw new Error("No se pudieron obtener las terminales POS.");
    }

    return res.json();
  },
});

export const directSaleCustomersClientQueryOptions = (orgSlug: string) => ({
  queryKey: directSaleCustomersQueryKey(orgSlug),
  queryFn: async (): Promise<Customer[]> => {
    const res = await fetch(`/api/org/${orgSlug}/clientes?status=active`);

    if (!res.ok) {
      throw new Error("No se pudieron obtener los clientes.");
    }

    return res.json();
  },
});
