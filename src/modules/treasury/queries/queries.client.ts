"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  IssuedCheckEstado,
  ReceivedCheckEstado,
  TreasuryMovementTipo,
} from "@/lib/accounting-client";
import {
  fetchBoletas,
  fetchChequeEmitido,
  fetchChequeRecibido,
  fetchChequesEmitidos,
  fetchChequesRecibidos,
  fetchCuentaBancaria,
  fetchCuentasBancarias,
  fetchMovimientos,
} from "@/lib/accounting-client";
import { treasuryQueryKeys } from "./query-keys";

// ------------------------------------------------------------
// useCuentasBancarias
// ------------------------------------------------------------
export function useCuentasBancarias(
  orgId: string,
  options?: { soloActivas?: boolean; enabled?: boolean }
) {
  return useQuery({
    queryKey: treasuryQueryKeys.cuentasBancarias(orgId, options?.soloActivas),
    queryFn: () => fetchCuentasBancarias(orgId, options?.soloActivas),
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled !== false && !!orgId,
  });
}

// ------------------------------------------------------------
// useCuentaBancaria
// ------------------------------------------------------------
export function useCuentaBancaria(
  id: string | null,
  orgId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: treasuryQueryKeys.cuentaBancaria(orgId, id ?? ""),
    queryFn: () => fetchCuentaBancaria(id ?? "", orgId),
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled !== false && !!id && !!orgId,
  });
}

// ------------------------------------------------------------
// useMovimientos
// ------------------------------------------------------------
export function useMovimientos(params: {
  orgId: string;
  cuentaId?: string;
  desde?: string;
  hasta?: string;
  tipo?: TreasuryMovementTipo;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: treasuryQueryKeys.movimientos(params.orgId, {
      cuentaId: params.cuentaId,
      desde: params.desde,
      hasta: params.hasta,
      tipo: params.tipo,
    }),
    queryFn: () => fetchMovimientos(params),
    enabled: params.enabled !== false && !!params.orgId,
  });
}

// ------------------------------------------------------------
// useChequesRecibidos
// ------------------------------------------------------------
export function useChequesRecibidos(
  orgId: string,
  estado?: ReceivedCheckEstado,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: treasuryQueryKeys.chequesRecibidos(orgId, estado),
    queryFn: () => fetchChequesRecibidos(orgId, estado),
    enabled: options?.enabled !== false && !!orgId,
  });
}

// ------------------------------------------------------------
// useChequeRecibido
// ------------------------------------------------------------
export function useChequeRecibido(
  id: string | null,
  orgId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: treasuryQueryKeys.chequeRecibido(orgId, id ?? ""),
    queryFn: () => fetchChequeRecibido(id ?? "", orgId),
    enabled: options?.enabled !== false && !!id && !!orgId,
  });
}

// ------------------------------------------------------------
// useChequesEmitidos
// ------------------------------------------------------------
export function useChequesEmitidos(
  orgId: string,
  estado?: IssuedCheckEstado,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: treasuryQueryKeys.chequesEmitidos(orgId, estado),
    queryFn: () => fetchChequesEmitidos(orgId, estado),
    enabled: options?.enabled !== false && !!orgId,
  });
}

// ------------------------------------------------------------
// useChequeEmitido
// ------------------------------------------------------------
export function useChequeEmitido(
  id: string | null,
  orgId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: treasuryQueryKeys.chequeEmitido(orgId, id ?? ""),
    queryFn: () => fetchChequeEmitido(id ?? "", orgId),
    enabled: options?.enabled !== false && !!id && !!orgId,
  });
}

// ------------------------------------------------------------
// useBoletas
// ------------------------------------------------------------
export function useBoletas(
  orgId: string,
  cuentaId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: treasuryQueryKeys.boletas(orgId, cuentaId),
    queryFn: () => fetchBoletas(orgId, cuentaId),
    enabled: options?.enabled !== false && !!orgId,
  });
}
