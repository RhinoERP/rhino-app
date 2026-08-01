"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchCuenta,
  fetchCuentas,
  fetchCuentasArbol,
  fetchInformalEntries,
  fetchInformalEntryById,
  fetchLibroDiario,
  fetchLibroIIBB,
  fetchLibroIVA,
  fetchLibroMayor,
  fetchReglas,
} from "@/lib/accounting-client";

// ------------------------------------------------------------
// Query Keys
// ------------------------------------------------------------
export const accountingQueryKeys = {
  cuentas: (orgId: string) => ["accounting", "cuentas", orgId] as const,
  cuenta: (orgId: string, id: string) =>
    ["accounting", "cuenta", orgId, id] as const,
  reglas: (orgId: string) => ["accounting", "reglas", orgId] as const,
  diario: (orgId: string, desde: string, hasta: string, extra?: object) =>
    ["accounting", "diario", orgId, desde, hasta, extra] as const,
  mayor: (orgId: string, cuentaId: string, desde: string, hasta: string) =>
    ["accounting", "mayor", orgId, cuentaId, desde, hasta] as const,
  iva: (
    orgId: string,
    desde: string,
    hasta: string,
    tipo: "ventas" | "compras"
  ) => ["accounting", "iva", orgId, desde, hasta, tipo] as const,
  iibb: (orgId: string, desde: string, hasta: string) =>
    ["accounting", "iibb", orgId, desde, hasta] as const,
  informalEntries: (
    orgId: string,
    filters: {
      estadoFormalizacion?: string;
      sourceType?: string;
      desde?: string;
      hasta?: string;
    }
  ) => ["accounting", "informal-entries", orgId, filters] as const,
  informalEntry: (orgId: string, entryId: string) =>
    ["accounting", "informal-entry", orgId, entryId] as const,
  cuentasArbol: (orgId: string) =>
    ["accounting", "cuentas-arbol", orgId] as const,
};

// ------------------------------------------------------------
// useCuentas
// ------------------------------------------------------------
export function useCuentas(orgId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: accountingQueryKeys.cuentas(orgId),
    queryFn: () => fetchCuentas(orgId),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

// ------------------------------------------------------------
// useLibroDiario
// ------------------------------------------------------------
export function useLibroDiario(params: {
  orgId: string;
  desde: string;
  hasta: string;
  page?: number;
  pageSize?: number;
  cuentaId?: string;
  tipoEvento?: string;
}) {
  return useQuery({
    queryKey: accountingQueryKeys.diario(
      params.orgId,
      params.desde,
      params.hasta,
      {
        page: params.page,
        cuentaId: params.cuentaId,
        tipoEvento: params.tipoEvento,
      }
    ),
    queryFn: () => fetchLibroDiario(params),
    enabled: !!params.orgId && !!params.desde && !!params.hasta,
  });
}

// ------------------------------------------------------------
// useLibroMayor
// ------------------------------------------------------------
export function useLibroMayor(
  cuentaId: string | null,
  params: { orgId: string; desde: string; hasta: string }
) {
  return useQuery({
    queryKey: accountingQueryKeys.mayor(
      params.orgId,
      cuentaId ?? "",
      params.desde,
      params.hasta
    ),
    queryFn: () => fetchLibroMayor(cuentaId ?? "", params),
    enabled: !!cuentaId && !!params.orgId && !!params.desde && !!params.hasta,
  });
}

// ------------------------------------------------------------
// useLibroIVA
// ------------------------------------------------------------
export function useLibroIVA(params: {
  orgId: string;
  desde: string;
  hasta: string;
  tipo: "ventas" | "compras";
}) {
  return useQuery({
    queryKey: accountingQueryKeys.iva(
      params.orgId,
      params.desde,
      params.hasta,
      params.tipo
    ),
    queryFn: () => fetchLibroIVA(params),
    enabled: !!params.orgId && !!params.desde && !!params.hasta,
  });
}

// ------------------------------------------------------------
// useLibroIIBB
// ------------------------------------------------------------
export function useLibroIIBB(params: {
  orgId: string;
  desde: string;
  hasta: string;
}) {
  return useQuery({
    queryKey: accountingQueryKeys.iibb(
      params.orgId,
      params.desde,
      params.hasta
    ),
    queryFn: () => fetchLibroIIBB(params),
    enabled: !!params.orgId && !!params.desde && !!params.hasta,
  });
}

// ------------------------------------------------------------
// useReglas
// ------------------------------------------------------------
export function useReglas(orgId: string) {
  return useQuery({
    queryKey: accountingQueryKeys.reglas(orgId),
    queryFn: () => fetchReglas(orgId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useInformalEntries(params: {
  orgId: string;
  estadoFormalizacion?: "PENDIENTE" | "CANCELADO" | "ASENTADO";
  sourceType?:
    | "NOTA_DE_VENTA"
    | "FACTURA_PENDIENTE"
    | "COBRO"
    | "ORDEN_PAGO"
    | "COMPRA"
    | "NOTA_DE_CREDITO";
  desde?: string;
  hasta?: string;
}) {
  return useQuery({
    queryKey: accountingQueryKeys.informalEntries(params.orgId, {
      estadoFormalizacion: params.estadoFormalizacion,
      sourceType: params.sourceType,
      desde: params.desde,
      hasta: params.hasta,
    }),
    queryFn: () => fetchInformalEntries(params),
    enabled: !!params.orgId,
  });
}

export function useInformalEntry(params: { orgId: string; entryId: string }) {
  return useQuery({
    queryKey: accountingQueryKeys.informalEntry(params.orgId, params.entryId),
    queryFn: () => fetchInformalEntryById(params),
    enabled: !!params.orgId && !!params.entryId,
  });
}

// ------------------------------------------------------------
// useCuentasArbol — árbol jerárquico (para el plan de cuentas)
// ------------------------------------------------------------
export function useCuentasArbol(
  orgId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: accountingQueryKeys.cuentasArbol(orgId),
    queryFn: () => fetchCuentasArbol(orgId),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled !== false && !!orgId,
  });
}

// ------------------------------------------------------------
// useCuenta — detalle de una cuenta por id
// ------------------------------------------------------------
export function useCuenta(
  id: string | null,
  orgId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: accountingQueryKeys.cuenta(orgId, id ?? ""),
    queryFn: () => fetchCuenta(id ?? "", orgId),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled !== false && !!id && !!orgId,
  });
}
