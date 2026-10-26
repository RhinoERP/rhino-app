"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { rebuildPosSaleAccountingEvent } from "../service/pos.service";
import {
  formalizeSinglePosSaleAccountingEntry,
  loadPosSaleAccountingRow,
  type PosSaleAccountingPatch,
  persistPosSaleAccountingPatch,
  runPosSaleAccountingFlow,
} from "../service/pos-sale-accounting.service";
import { isPosSaleAccountingActionable } from "../utils/accounting-inbox";

const MAX_RETRY_BATCH = 50;

export type RetryPosSaleAccountingInput = {
  orgSlug: string;
  posSaleIds: string[];
};

export type RetryPosSaleAccountingItemResult =
  | { posSaleId: string; success: true; accountingStatus: string }
  | { posSaleId: string; success: false; error: string };

export type RetryPosSaleAccountingResult =
  | { success: true; results: RetryPosSaleAccountingItemResult[] }
  | { success: false; error: string };

type RetryContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgSlug: string;
  orgId: string;
  automaticAccountingEnabled: boolean;
};

async function retryOne(
  context: RetryContext,
  posSaleId: string
): Promise<RetryPosSaleAccountingItemResult> {
  const { supabase, orgId } = context;
  const row = await loadPosSaleAccountingRow({ supabase, orgId, posSaleId });

  if (!row) {
    return { posSaleId, success: false, error: "Venta POS no encontrada" };
  }

  if (!isPosSaleAccountingActionable(row.accounting_status)) {
    return {
      posSaleId,
      success: false,
      error: "La venta no tiene contabilidad pendiente.",
    };
  }

  let patch: Partial<PosSaleAccountingPatch>;
  const needsFormalization =
    row.arca_status === "authorized" &&
    (row.accounting_status === "PENDING" ||
      row.accounting_status === "FORMALIZATION_ERROR") &&
    row.accounting_sale_entry_id;

  if (needsFormalization && row.accounting_sale_entry_id) {
    patch = await formalizeSinglePosSaleAccountingEntry({
      orgId,
      posSaleId,
      saleEntryId: row.accounting_sale_entry_id,
    });
  } else {
    // Se reutiliza el snapshot original para no arriesgar drift con la venta.
    let evento = row.accounting_sale_event_snapshot;

    if (!evento) {
      const rebuilt = await rebuildPosSaleAccountingEvent({
        orgSlug: context.orgSlug,
        orgId,
        posSaleId,
      });

      if (rebuilt.kind === "unavailable") {
        await persistPosSaleAccountingPatch({
          supabase,
          orgId,
          posSaleId,
          patch: {
            accounting_status: "REVIEW_REQUIRED",
            accounting_last_error: rebuilt.reason,
            accounting_updated_at: new Date().toISOString(),
          },
        });
        return { posSaleId, success: false, error: rebuilt.reason };
      }

      evento = rebuilt.evento;
    }

    patch = await runPosSaleAccountingFlow({
      eventoVenta: evento,
      isTicketX: row.invoice_type === "TICKET_X",
      automaticAccountingEnabled: context.automaticAccountingEnabled,
      orgId,
      existingSaleEntryId: row.accounting_sale_entry_id,
      isArcaAuthorized: row.arca_status === "authorized",
    });
  }

  const updateError = await persistPosSaleAccountingPatch({
    supabase,
    orgId,
    posSaleId,
    patch,
  });

  if (updateError) {
    return {
      posSaleId,
      success: false,
      error: `No se pudo guardar el estado contable: ${updateError}`,
    };
  }

  return {
    posSaleId,
    success: true,
    accountingStatus: patch.accounting_status ?? row.accounting_status,
  };
}

export async function retryPosSaleAccountingAction(
  input: RetryPosSaleAccountingInput
): Promise<RetryPosSaleAccountingResult> {
  await ensure("accounting.manage", input.orgSlug);

  const posSaleIds = [...new Set(input.posSaleIds)];
  if (posSaleIds.length === 0 || posSaleIds.length > MAX_RETRY_BATCH) {
    return {
      success: false,
      error: `Seleccioná entre 1 y ${MAX_RETRY_BATCH} ventas.`,
    };
  }

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  const orgSettings = await getOrgSettings(input.orgSlug);
  const context: RetryContext = {
    supabase: await createClient(),
    orgSlug: input.orgSlug,
    orgId: org.id,
    automaticAccountingEnabled: orgSettings.automatic_accounting_enabled,
  };

  const results: RetryPosSaleAccountingItemResult[] = [];
  // Secuencial: evita saturar el servicio contable con reintentos en paralelo.
  for (const posSaleId of posSaleIds) {
    try {
      results.push(await retryOne(context, posSaleId));
    } catch (error) {
      results.push({
        posSaleId,
        success: false,
        error:
          error instanceof Error ? error.message : "Error de contabilidad POS",
      });
    }
  }

  return { success: true, results };
}
