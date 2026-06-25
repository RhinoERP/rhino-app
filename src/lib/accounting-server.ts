/**
 * Server-side accounting service client.
 * Calls the accounting Express service directly (bypasses the Next.js proxy),
 * so it can be used from Server Actions and server-side service functions.
 *
 * Do NOT import this file in client components — use accounting-client.ts instead.
 */
import "server-only";

import type { AnyEvento } from "@/modules/accounting/types";

const TIMEOUT_MS = 10_000;

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

// ------------------------------------------------------------
// createInformalEntry
// Llama POST /eventos/informal — crea asiento en informal_entries.
// ------------------------------------------------------------
export async function createInformalEntry(
  evento: AnyEvento,
  sourceType: "NOTA_DE_VENTA" | "FACTURA_PENDIENTE"
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
  informalEntryId: string
): Promise<string> {
  const result = await servicePost<{ journalEntryId: string }>(
    `informal-entries/${informalEntryId}/formalizar`,
    {}
  );
  return result.journalEntryId;
}
