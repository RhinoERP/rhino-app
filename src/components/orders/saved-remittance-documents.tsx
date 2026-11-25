"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RemittanceMaskPrintModal } from "@/components/sales/remittance-mask-print-modal";
import { Button } from "@/components/ui/button";
import { downloadOrderRemittanceAction } from "@/modules/orders/actions/download-order-remittance.action";
import {
  getSavedOrderRemittancesAction,
  previewSavedRemittanceMasksAction,
} from "@/modules/orders/actions/saved-order-remittances.action";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";
import { RemittanceReceiptLink } from "./remittance-receipt-link";

function SavedMasks({
  orgSlug,
  ids,
  all = false,
}: {
  orgSlug: string;
  ids: string[];
  all?: boolean;
}) {
  const { data: settings } = useOrgSettings(orgSlug);
  if (!settings?.remittance_mask_printing_enabled) {
    return null;
  }
  return (
    <RemittanceMaskPrintModal
      loadMask={async (purchaseOrderNumber) => {
        const result = await previewSavedRemittanceMasksAction(
          orgSlug,
          ids,
          purchaseOrderNumber
        );
        if (result.success) {
          return result.html;
        }
        toast.error(result.error);
        return null;
      }}
      triggerLabel={all ? "Imprimir todas las máscaras" : "Imprimir máscara"}
    />
  );
}

export function SavedRemittanceDocuments({
  orgSlug,
  parentOrderId,
  childOrderId,
}: {
  orgSlug: string;
  parentOrderId: string;
  childOrderId?: string;
}) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["order-remittance-documents", orgSlug, parentOrderId],
    queryFn: () => getSavedOrderRemittancesAction(orgSlug, parentOrderId),
    staleTime: 30_000,
  });
  const documents = (query.data ?? []).filter(
    (document) => !childOrderId || document.orderIds.includes(childOrderId)
  );
  const active = documents.filter((document) => document.status === "ISSUED");
  const maskDocuments = active.filter(
    (document) => document.fiscal?.mode !== "self_printed"
  );
  if (query.isPending) {
    return (
      <div
        aria-busy="true"
        className="h-20 animate-pulse rounded-md border bg-muted/40"
      >
        <span className="sr-only">Cargando remitos del despacho…</span>
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="text-destructive text-sm">
        No se pudieron consultar los remitos.{" "}
        <Button onClick={() => query.refetch()} size="sm" variant="ghost">
          Reintentar
        </Button>
      </p>
    );
  }
  if (!documents.length) {
    return null;
  }

  const download = async (document: (typeof documents)[number]) => {
    if (!document.childOrderId) {
      return;
    }
    setDownloading(document.id);
    try {
      const result = await downloadOrderRemittanceAction(
        orgSlug,
        document.childOrderId,
        document.number
      );
      if (!result.success) {
        throw new Error(result.error);
      }
      const bytes = Uint8Array.from(
        window.atob(result.pdfBase64),
        (character) => character.charCodeAt(0)
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" })
      );
      const link = window.document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      await query.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo descargar el remito."
      );
    } finally {
      setDownloading(null);
    }
  };

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-sm">Remitos del despacho</h3>
        {maskDocuments.length > 1 && (
          <SavedMasks
            all
            ids={maskDocuments.map((document) => document.id)}
            orgSlug={orgSlug}
          />
        )}
      </div>
      {documents.map((document) => (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"
          key={document.id}
        >
          <span className="min-w-0 max-w-full break-words text-sm">
            Remito {document.number} · {document.lineCount} líneas
            {document.status !== "ISSUED" && " · Anulado"}
            {document.fiscal && ` · CAI ${document.fiscal.cai}`}
            {document.receipt?.received_at &&
              ` · Recibido por ${document.receipt.receiver_name}`}
          </span>
          {document.status === "ISSUED" && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={downloading !== null}
                onClick={() => download(document)}
                size="sm"
                type="button"
                variant="outline"
              >
                {downloading === document.id ? "Generando…" : "Descargar PDF"}
              </Button>
              {document.fiscal?.mode !== "self_printed" && (
                <SavedMasks ids={[document.id]} orgSlug={orgSlug} />
              )}
              {document.fiscal && !document.receipt?.received_at && (
                <RemittanceReceiptLink
                  documentId={document.id}
                  orgSlug={orgSlug}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
