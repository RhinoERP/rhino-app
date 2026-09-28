import "server-only";

import {
  asentarInformalEntry,
  createInformalEntry,
  findJournalEntryIdByReferenceServer,
  formalizarEntry,
  isAccountingNotFoundError,
  previewAccountingEvent,
} from "@/lib/accounting-server";
import type { createClient } from "@/lib/supabase/server";
import type { EventoVentaPos } from "@/modules/accounting/types";
import type { PosSaleAccountingStatus } from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PosSaleAccountingPatch = {
  accounting_status: PosSaleAccountingStatus;
  accounting_sale_entry_id: string | null;
  accounting_last_error: string | null;
  accounting_sale_event_snapshot: EventoVentaPos | null;
  accounting_updated_at: string;
};

export async function persistPosSaleAccountingPatch(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  posSaleId: string;
  patch: Partial<PosSaleAccountingPatch>;
}): Promise<string | null> {
  const { error } = await params.supabase
    .from("pos_sales")
    .update(params.patch as never)
    .eq("organization_id", params.orgId)
    .eq("id", params.posSaleId);

  return error ? error.message : null;
}

export type PosSaleAccountingRow = {
  invoice_type: string | null;
  arca_status: string | null;
  accounting_status: PosSaleAccountingStatus;
  accounting_sale_entry_id: string | null;
  accounting_sale_event_snapshot: EventoVentaPos | null;
};

export async function loadPosSaleAccountingRow(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  posSaleId: string;
}): Promise<PosSaleAccountingRow | null> {
  const { data, error } = await params.supabase
    .from("pos_sales")
    .select(
      "invoice_type, arca_status, accounting_status, accounting_sale_entry_id, accounting_sale_event_snapshot" as never
    )
    .eq("organization_id", params.orgId)
    .eq("id", params.posSaleId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo leer la venta POS: ${error.message}`);
  }

  return data as unknown as PosSaleAccountingRow | null;
}

// Cuenta de cobro por defecto según el medio de pago POS. Efectivo y medios
// electrónicos dependen 100% de la configuración de cada organización (no
// hay cuenta "genérica" garantizada); sólo VALORES_A_DEPOSITAR es seguro
// porque el módulo de tesorería ya lo siembra automáticamente para toda org.
export function resolvePosCobroDefaultAccountCode(params: {
  paymentMethod: string;
  cashAccountCode: string | null;
  cardAccountCode: string | null;
  transferAccountCode: string | null;
  electronicAccountCode: string | null;
}): string | undefined {
  if (params.paymentMethod === "efectivo") {
    return params.cashAccountCode ?? undefined;
  }

  if (params.paymentMethod === "cheque" || params.paymentMethod === "e-cheq") {
    return "VALORES_A_DEPOSITAR";
  }

  if (
    params.paymentMethod === "tarjeta_de_credito" ||
    params.paymentMethod === "tarjeta_de_debito"
  ) {
    return params.cardAccountCode ?? params.electronicAccountCode ?? undefined;
  }

  if (
    params.paymentMethod === "transferencia" ||
    params.paymentMethod === "deposito"
  ) {
    return (
      params.transferAccountCode ?? params.electronicAccountCode ?? undefined
    );
  }

  return params.electronicAccountCode ?? undefined;
}

// Resuelve (o crea, en modo automático) el asiento informal de la venta;
// retorna null cuando debe quedar pendiente de revisión manual.
async function resolvePosAccountingEntryId(params: {
  existingEntryId: string | null;
  automaticAccountingEnabled: boolean;
  evento: EventoVentaPos;
}): Promise<string | null> {
  if (params.existingEntryId) {
    return params.existingEntryId;
  }

  if (!params.automaticAccountingEnabled) {
    return null;
  }

  const preview = await previewAccountingEvent(params.evento);
  if (preview.estadoImputacion !== "COMPLETO") {
    return null;
  }

  return createInformalEntry(params.evento, "VENTA_POS");
}

export async function runPosSaleAccountingFlow(params: {
  eventoVenta: EventoVentaPos;
  isTicketX: boolean;
  automaticAccountingEnabled: boolean;
  orgId: string;
  existingSaleEntryId?: string | null;
  isArcaAuthorized?: boolean;
}): Promise<PosSaleAccountingPatch> {
  const base: PosSaleAccountingPatch = {
    accounting_status: "REVIEW_REQUIRED",
    accounting_sale_entry_id: params.existingSaleEntryId ?? null,
    accounting_last_error: null,
    accounting_sale_event_snapshot: params.eventoVenta,
    accounting_updated_at: new Date().toISOString(),
  };
  let saleEntryId: string | null = base.accounting_sale_entry_id;

  try {
    saleEntryId = await resolvePosAccountingEntryId({
      existingEntryId: saleEntryId,
      automaticAccountingEnabled: params.automaticAccountingEnabled,
      evento: params.eventoVenta,
    });

    if (!saleEntryId) {
      return base;
    }

    if (params.isTicketX) {
      await asentarInformalEntry(saleEntryId, params.orgId);

      return {
        ...base,
        accounting_status: "SETTLED_INFORMAL",
        accounting_sale_entry_id: saleEntryId,
      };
    }

    if (params.isArcaAuthorized) {
      const formalization = await formalizeSinglePosSaleAccountingEntry({
        orgId: params.orgId,
        posSaleId: params.eventoVenta.referenciaId,
        saleEntryId,
      });

      return { ...base, ...formalization };
    }

    return {
      ...base,
      accounting_status: "PENDING",
      accounting_sale_entry_id: saleEntryId,
    };
  } catch (error) {
    return {
      ...base,
      accounting_status: "ERROR",
      accounting_sale_entry_id: saleEntryId,
      accounting_last_error:
        error instanceof Error ? error.message : "Error de contabilidad POS",
    };
  }
}

export type PosSingleSaleFormalizationPatch = {
  accounting_status: "POSTED" | "FORMALIZATION_ERROR";
  accounting_sale_entry_id: string;
  accounting_last_error: string | null;
  accounting_updated_at: string;
};

// Si un intento previo formalizó pero no persistió el resultado, el informal ya
// no existe: se recupera el id del asiento formal por su referencia a la venta.
async function formalizeIfInformal(params: {
  entryId: string;
  orgId: string;
  posSaleId: string;
}): Promise<string> {
  try {
    return await formalizarEntry(params.entryId, params.orgId);
  } catch (error) {
    if (!isAccountingNotFoundError(error)) {
      throw error;
    }

    const journalId = await findJournalEntryIdByReferenceServer({
      orgId: params.orgId,
      referenciaId: params.posSaleId,
      referenciaTabla: "pos_sales",
      tipoEvento: "VENTA_POS",
    });

    if (!journalId) {
      throw error;
    }

    return journalId;
  }
}

export async function formalizeSinglePosSaleAccountingEntry(params: {
  orgId: string;
  posSaleId: string;
  saleEntryId: string;
}): Promise<PosSingleSaleFormalizationPatch> {
  const nowIso = new Date().toISOString();

  try {
    const journalId = await formalizeIfInformal({
      entryId: params.saleEntryId,
      orgId: params.orgId,
      posSaleId: params.posSaleId,
    });

    return {
      accounting_status: "POSTED",
      accounting_sale_entry_id: journalId,
      accounting_last_error: null,
      accounting_updated_at: nowIso,
    };
  } catch (error) {
    return {
      accounting_status: "FORMALIZATION_ERROR",
      accounting_sale_entry_id: params.saleEntryId,
      accounting_last_error:
        error instanceof Error
          ? error.message
          : "No se pudo formalizar el asiento POS",
      accounting_updated_at: nowIso,
    };
  }
}
