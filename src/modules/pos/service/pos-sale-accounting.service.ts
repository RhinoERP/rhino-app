import "server-only";

import {
  asentarInformalEntry,
  createInformalEntry,
  formalizarEntry,
  previewAccountingEvent,
} from "@/lib/accounting-server";
import type {
  EventoCobroPos,
  EventoVentaPos,
} from "@/modules/accounting/types";

export type PosSaleAccountingStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "REVIEW_REQUIRED"
  | "PARTIALLY_POSTED"
  | "POSTED"
  | "SETTLED_INFORMAL"
  | "ERROR";

export type PosSaleAccountingPatch = {
  accounting_status: PosSaleAccountingStatus;
  accounting_sale_entry_id: string | null;
  accounting_payment_entry_id: string | null;
  accounting_last_error: string | null;
  accounting_sale_event_snapshot: EventoVentaPos | null;
  accounting_payment_event_snapshot: EventoCobroPos | null;
  accounting_updated_at: string;
};

// Cuenta de cobro por defecto según el medio de pago POS. Efectivo y medios
// electrónicos dependen 100% de la configuración de cada organización (no
// hay cuenta "genérica" garantizada); sólo VALORES_A_DEPOSITAR es seguro
// porque el módulo de tesorería ya lo siembra automáticamente para toda org.
export function resolvePosCobroDefaultAccountCode(params: {
  paymentMethod: string;
  cashAccountCode: string | null;
  electronicAccountCode: string | null;
}): string | undefined {
  if (params.paymentMethod === "efectivo") {
    return params.cashAccountCode ?? undefined;
  }

  if (params.paymentMethod === "cheque" || params.paymentMethod === "e-cheq") {
    return "VALORES_A_DEPOSITAR";
  }

  return params.electronicAccountCode ?? undefined;
}

// Resuelve (o crea, en modo automático) el asiento informal de un paso;
// retorna null cuando debe quedar pendiente de revisión manual.
async function resolvePosAccountingEntryId(params: {
  existingEntryId: string | null;
  automaticAccountingEnabled: boolean;
  evento: EventoVentaPos | EventoCobroPos;
  sourceType: "VENTA_POS" | "COBRO_POS";
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

  return createInformalEntry(params.evento, params.sourceType);
}

/**
 * Orquesta venta+cobro POS: nunca crea el cobro sin que la venta ya exista
 * (informal o formal). Los IDs ya existentes se reciben para soportar
 * reintentos idempotentes sin recrear lo que ya se creó.
 */
export async function runPosSaleAccountingFlow(params: {
  eventoVenta: EventoVentaPos;
  eventoCobro: EventoCobroPos;
  isTicketX: boolean;
  automaticAccountingEnabled: boolean;
  orgId: string;
  existingSaleEntryId?: string | null;
  existingPaymentEntryId?: string | null;
}): Promise<PosSaleAccountingPatch> {
  const base: PosSaleAccountingPatch = {
    accounting_status: "REVIEW_REQUIRED",
    accounting_sale_entry_id: params.existingSaleEntryId ?? null,
    accounting_payment_entry_id: params.existingPaymentEntryId ?? null,
    accounting_last_error: null,
    accounting_sale_event_snapshot: params.eventoVenta,
    accounting_payment_event_snapshot: params.eventoCobro,
    accounting_updated_at: new Date().toISOString(),
  };

  try {
    const saleEntryId = await resolvePosAccountingEntryId({
      existingEntryId: params.existingSaleEntryId ?? null,
      automaticAccountingEnabled: params.automaticAccountingEnabled,
      evento: params.eventoVenta,
      sourceType: "VENTA_POS",
    });

    if (!saleEntryId) {
      return base;
    }

    const paymentEntryId = await resolvePosAccountingEntryId({
      existingEntryId: params.existingPaymentEntryId ?? null,
      automaticAccountingEnabled: params.automaticAccountingEnabled,
      evento: params.eventoCobro,
      sourceType: "COBRO_POS",
    });

    if (!paymentEntryId) {
      return { ...base, accounting_sale_entry_id: saleEntryId };
    }

    if (params.isTicketX) {
      await asentarInformalEntry(saleEntryId, params.orgId);
      await asentarInformalEntry(paymentEntryId, params.orgId);

      return {
        ...base,
        accounting_status: "SETTLED_INFORMAL",
        accounting_sale_entry_id: saleEntryId,
        accounting_payment_entry_id: paymentEntryId,
      };
    }

    return {
      ...base,
      accounting_status: "PENDING",
      accounting_sale_entry_id: saleEntryId,
      accounting_payment_entry_id: paymentEntryId,
    };
  } catch (error) {
    return {
      ...base,
      accounting_status: "ERROR",
      accounting_last_error:
        error instanceof Error ? error.message : "Error de contabilidad POS",
    };
  }
}

export type PosSaleFormalizationPatch = {
  accounting_status: "POSTED" | "PARTIALLY_POSTED";
  accounting_sale_entry_id: string;
  accounting_payment_entry_id: string;
  accounting_last_error: string | null;
  accounting_updated_at: string;
};

// Si ya se formalizó en un intento previo, la fila informal fue borrada y el
// id guardado ya es el asiento formal: no es un error real, se conserva tal cual.
async function formalizeIfInformal(params: {
  entryId: string;
  orgId: string;
}): Promise<string> {
  try {
    return await formalizarEntry(params.entryId, params.orgId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("no encontrado")) {
      return params.entryId;
    }
    throw error;
  }
}

/**
 * Formaliza venta y cobro juntos cuando ARCA autoriza una Factura B/C.
 * Nunca lanza: un fallo acá no debe revertir la autorización ARCA ya
 * obtenida. Si sólo una mitad se formaliza, el resultado queda
 * PARTIALLY_POSTED para que un reintento posterior complete la otra sin
 * volver a tocar la que ya es un asiento formal.
 */
export async function formalizePosSaleAccountingEntries(params: {
  orgId: string;
  saleEntryId: string;
  paymentEntryId: string;
}): Promise<PosSaleFormalizationPatch> {
  const nowIso = new Date().toISOString();
  let saleJournalId = params.saleEntryId;

  try {
    saleJournalId = await formalizeIfInformal({
      entryId: params.saleEntryId,
      orgId: params.orgId,
    });
  } catch (error) {
    return {
      accounting_status: "PARTIALLY_POSTED",
      accounting_sale_entry_id: params.saleEntryId,
      accounting_payment_entry_id: params.paymentEntryId,
      accounting_last_error:
        error instanceof Error
          ? error.message
          : "No se pudo formalizar el asiento de venta POS",
      accounting_updated_at: nowIso,
    };
  }

  try {
    const paymentJournalId = await formalizeIfInformal({
      entryId: params.paymentEntryId,
      orgId: params.orgId,
    });

    return {
      accounting_status: "POSTED",
      accounting_sale_entry_id: saleJournalId,
      accounting_payment_entry_id: paymentJournalId,
      accounting_last_error: null,
      accounting_updated_at: nowIso,
    };
  } catch (error) {
    return {
      accounting_status: "PARTIALLY_POSTED",
      accounting_sale_entry_id: saleJournalId,
      accounting_payment_entry_id: params.paymentEntryId,
      accounting_last_error:
        error instanceof Error
          ? error.message
          : "No se pudo formalizar el asiento de cobro POS",
      accounting_updated_at: nowIso,
    };
  }
}
