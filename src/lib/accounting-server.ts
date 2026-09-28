/**
 * Server-side accounting service client.
 * Calls the accounting Express service directly (bypasses the Next.js proxy),
 * so it can be used from Server Actions and server-side service functions.
 *
 * Do NOT import this file in client components — use accounting-client.ts instead.
 */
import "server-only";

import type {
  AnyEvento,
  InformalEntrySourceType,
  PreviewResponse,
} from "@/modules/accounting/types";

const TIMEOUT_MS = 10_000;
const HTTP_NOT_FOUND = 404;

export class AccountingServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AccountingServiceError";
    this.status = status;
  }
}

export function isAccountingNotFoundError(error: unknown): boolean {
  return (
    error instanceof AccountingServiceError && error.status === HTTP_NOT_FOUND
  );
}

function toServiceError(json: unknown, status: number): AccountingServiceError {
  return new AccountingServiceError(
    (json as { error?: string }).error ?? `Accounting service error: ${status}`,
    status
  );
}

function getServiceConfig(): { url: string; token: string } {
  const url = process.env.ACCOUNTING_SERVICE_URL;
  const token = process.env.ACCOUNTING_SERVICE_TOKEN;
  if (!(url && token)) {
    throw new Error(
      "Servicio contable no configurado (ACCOUNTING_SERVICE_URL / ACCOUNTING_SERVICE_TOKEN)"
    );
  }
  return { url, token };
}

async function servicePost<T>(path: string, body: unknown): Promise<T> {
  const { url, token } = getServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toServiceError(json, res.status);
    }
    return (json as { data: T }).data;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// previewAccountingEvent
// Llama POST /preview — resuelve el evento sin persistir.
// Retorna PreviewResponse con estadoImputacion COMPLETO | SUSPENSO.
// ------------------------------------------------------------
export async function previewAccountingEvent(
  evento: AnyEvento
): Promise<PreviewResponse> {
  return await servicePost<PreviewResponse>("preview", evento);
}

// ------------------------------------------------------------
// createInformalEntry
// Llama POST /eventos/informal — crea asiento en informal_entries.
// ------------------------------------------------------------
export async function createInformalEntry(
  evento: AnyEvento,
  sourceType: InformalEntrySourceType
): Promise<string> {
  const result = await servicePost<{ informalEntryId: string }>(
    "eventos/informal",
    { ...evento, source_type: sourceType }
  );
  return result.informalEntryId;
}

// ------------------------------------------------------------
// confirmAccountingEvent
// Llama POST /eventos — crea el asiento directo en journal_entries.
// Idempotente: misma idempotencyKey retorna el mismo asientoId.
// ------------------------------------------------------------
export async function confirmAccountingEvent(
  evento: AnyEvento
): Promise<string> {
  const result = await servicePost<{ asientoId: string }>("eventos", evento);
  return result.asientoId;
}

// ------------------------------------------------------------
// formalizarEntry
// Llama POST /informal-entries/:id/formalizar — crea asiento formal.
// Retorna el UUID del journal_entry creado.
// ------------------------------------------------------------
export async function formalizarEntry(
  informalEntryId: string,
  orgId: string
): Promise<string> {
  const result = await servicePost<{ journalEntryId: string }>(
    `informal-entries/${informalEntryId}/formalizar?org_id=${encodeURIComponent(orgId)}`,
    {}
  );
  return result.journalEntryId;
}

export async function cancelInformalEntry(
  informalEntryId: string,
  orgId: string
): Promise<void> {
  await servicePost<{ informalEntryId: string }>(
    `informal-entries/${informalEntryId}/cancelar?org_id=${encodeURIComponent(orgId)}`,
    {}
  );
}

export async function asentarInformalEntry(
  informalEntryId: string,
  orgId: string
): Promise<void> {
  await servicePost<{ informalEntryId: string }>(
    `informal-entries/${informalEntryId}/asentar?org_id=${encodeURIComponent(orgId)}`,
    {}
  );
}

export type InformalEntryReference = {
  id: string;
  referencia_id: string | null;
  referencia_tabla: string | null;
  source_type: string | null;
  estado_formalizacion: string;
};

// Llama GET /informal-entries/:id — retorna null si no existe en la organización.
export async function getInformalEntryServer(
  informalEntryId: string,
  orgId: string
): Promise<InformalEntryReference | null> {
  try {
    return await serviceGet<InformalEntryReference>(
      `informal-entries/${encodeURIComponent(informalEntryId)}?org_id=${encodeURIComponent(orgId)}`
    );
  } catch (error) {
    if (isAccountingNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function findJournalEntryIdByReferenceServer(params: {
  orgId: string;
  referenciaId: string;
  referenciaTabla: string;
  tipoEvento: string;
}): Promise<string | null> {
  const query = new URLSearchParams({
    org_id: params.orgId,
    referencia_id: params.referenciaId,
    referencia_tabla: params.referenciaTabla,
    tipo_evento: params.tipoEvento,
  });

  try {
    const result = await serviceGet<{ id: string }>(
      `asientos/by-reference?${query.toString()}`
    );
    return result.id;
  } catch (error) {
    if (isAccountingNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

// ============================================================
// Plan de Cuentas — CRUD (server-side, bypasses Next.js proxy)
// ============================================================

import type {
  CreateCuentaInput,
  CuentaItem,
  UpdateCuentaInput,
} from "@/lib/accounting-client";

async function serviceGet<T>(path: string): Promise<T> {
  const { url, token } = getServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/${path}`, {
      method: "GET",
      headers: { "X-Service-Token": token },
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toServiceError(json, res.status);
    }
    return (json as { data: T }).data;
  } finally {
    clearTimeout(timer);
  }
}

async function servicePut<T>(path: string, body: unknown): Promise<T> {
  const { url, token } = getServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/${path}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (json as { error?: string }).error ??
          `Accounting service error: ${res.status}`
      );
    }
    return (json as { data: T }).data;
  } finally {
    clearTimeout(timer);
  }
}

async function servicePatch<T>(path: string, body: unknown): Promise<T> {
  const { url, token } = getServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (json as { error?: string }).error ??
          `Accounting service error: ${res.status}`
      );
    }
    return (json as { data: T }).data;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchCuentaServer(
  id: string,
  orgId: string
): Promise<CuentaItem & { padre: CuentaItem | null }> {
  return serviceGet(`cuentas/${id}?org_id=${encodeURIComponent(orgId)}`);
}

export function createCuentaServer(
  input: CreateCuentaInput
): Promise<CuentaItem> {
  return servicePost("cuentas", input);
}

export function updateCuentaServer(
  id: string,
  input: UpdateCuentaInput
): Promise<CuentaItem> {
  return servicePut(`cuentas/${id}`, input);
}

export function toggleCuentaEstadoServer(
  id: string,
  activa: boolean
): Promise<CuentaItem> {
  return servicePatch(`cuentas/${id}/estado`, { activa });
}

// ============================================================
// Tesorería — wrappers server-to-service (bypasses Next.js proxy)
// ============================================================

import type {
  CreateBankAccountInput,
  CreateCashDepositSlipInput,
  CreateCheckDepositSlipInput,
  CreateIssuedCheckInput,
  CreateMovimientoBancarioInput,
  CreateReceivedCheckInput,
  EndorseReceivedChecksForPayableInput,
  EndorseReceivedChecksForPayableResult,
  IssuedCheck,
  ReceivedCheck,
  TreasuryBankAccount,
  TreasuryDepositSlip,
  TreasuryMovement,
  UpdateBankAccountInput,
} from "@/lib/accounting-client";

// ── Cuentas bancarias ─────────────────────────────────────────────────────────

export function fetchCuentasBancariasServer(
  orgId: string,
  soloActivas?: boolean
): Promise<TreasuryBankAccount[]> {
  const q = new URLSearchParams({ org_id: orgId });
  if (soloActivas) {
    q.set("solo_activas", "true");
  }
  return serviceGet(`tesoreria/cuentas-bancarias?${q}`);
}

export function createBankAccountServer(
  input: CreateBankAccountInput
): Promise<TreasuryBankAccount> {
  return servicePost("tesoreria/cuentas-bancarias", input);
}

export function updateBankAccountServer(
  id: string,
  orgId: string,
  input: UpdateBankAccountInput
): Promise<TreasuryBankAccount> {
  return servicePut(
    `tesoreria/cuentas-bancarias/${id}?org_id=${encodeURIComponent(orgId)}`,
    input
  );
}

export function toggleBankAccountEstadoServer(
  id: string,
  orgId: string,
  activa: boolean
): Promise<TreasuryBankAccount> {
  return servicePatch(
    `tesoreria/cuentas-bancarias/${id}/estado?org_id=${encodeURIComponent(orgId)}`,
    { activa }
  );
}

// ── Movimientos ───────────────────────────────────────────────────────────────

export function createMovimientoBancarioServer(
  input: CreateMovimientoBancarioInput
): Promise<TreasuryMovement> {
  return servicePost("tesoreria/movimientos-bancarios", input);
}

// ── Cheques recibidos ─────────────────────────────────────────────────────────

export function createChequeRecibidoServer(
  input: CreateReceivedCheckInput
): Promise<ReceivedCheck> {
  return servicePost("tesoreria/cheques/recibidos", input);
}

export function rechazarChequeRecibidoServer(
  id: string,
  orgId: string,
  cuentaBancariaId: string
): Promise<ReceivedCheck> {
  return servicePut(
    `tesoreria/cheques/recibidos/${id}/rechazar?org_id=${encodeURIComponent(orgId)}`,
    { cuentaBancariaId }
  );
}

export function endorseReceivedChecksForPayableServer(
  input: EndorseReceivedChecksForPayableInput
): Promise<EndorseReceivedChecksForPayableResult> {
  return servicePost("tesoreria/cheques/recibidos/endosar-para-pago", input);
}

// ── Cheques emitidos ──────────────────────────────────────────────────────────

export function createChequeEmitidoServer(
  input: CreateIssuedCheckInput
): Promise<IssuedCheck> {
  return servicePost("tesoreria/cheques/emitidos", input);
}

export function debitarChequeEmitidoServer(
  id: string,
  orgId: string
): Promise<IssuedCheck> {
  return servicePut(
    `tesoreria/cheques/emitidos/${id}/debitar?org_id=${encodeURIComponent(orgId)}`,
    {}
  );
}

export function rechazarChequeEmitidoServer(
  id: string,
  orgId: string
): Promise<IssuedCheck> {
  return servicePut(
    `tesoreria/cheques/emitidos/${id}/rechazar?org_id=${encodeURIComponent(orgId)}`,
    {}
  );
}

// ── Boletas de depósito ───────────────────────────────────────────────────────

export function createBoletaDepositoChequesServer(
  input: CreateCheckDepositSlipInput
): Promise<TreasuryDepositSlip> {
  return servicePost("tesoreria/boletas/deposito-cheques", input);
}

export function createBoletaDepositoEfectivoServer(
  input: CreateCashDepositSlipInput
): Promise<TreasuryDepositSlip> {
  return servicePost("tesoreria/boletas/deposito-efectivo", input);
}
