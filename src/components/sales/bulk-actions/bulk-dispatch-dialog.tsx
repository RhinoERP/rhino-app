"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCarriers } from "@/modules/carriers/hooks/use-carriers";
import { generateRemittanceNumber } from "@/modules/organizations/actions/generate-remittance-number.action";
import { getRemittanceSettings } from "@/modules/organizations/actions/get-remittance-settings.action";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";
import type { BulkSaleResult } from "@/modules/sales/actions/bulk-confirm-sales.action";
import { bulkDispatchSalesAction } from "@/modules/sales/actions/bulk-dispatch-sales.action";
import { salesQueryKey } from "@/modules/sales/queries/query-keys";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { BulkResultsDialog } from "./bulk-results-dialog";

type RemittanceEntry = {
  saleId: string;
  saleNumber: string;
  customerName: string;
  remittanceNumber: string;
};

type BulkDispatchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  selectedSales: SalesOrderWithCustomer[];
  onSuccess: () => void;
};

export function BulkDispatchDialog({
  open,
  onOpenChange,
  orgSlug,
  selectedSales,
  onSuccess,
}: BulkDispatchDialogProps) {
  const queryClient = useQueryClient();
  const { data: carriers = [] } = useCarriers(orgSlug);
  const { data: orgSettings } = useOrgSettings(orgSlug);
  const requireCarrier = orgSettings?.require_carrier_on_dispatch ?? false;

  const [entries, setEntries] = useState<RemittanceEntry[]>([]);
  const [carrierId, setCarrierId] = useState<string>("none");
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoNumbering, setAutoNumbering] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [results, setResults] = useState<BulkSaleResult[] | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const labelFor = (s: SalesOrderWithCustomer) =>
      s.sale_number ? `#${s.sale_number}` : s.id;

    const initial = selectedSales.map((s) => ({
      saleId: s.id,
      saleNumber: labelFor(s),
      customerName: s.customer?.fantasy_name ?? s.customer?.business_name ?? "",
      remittanceNumber: s.remittance_number ?? "",
    }));
    setEntries(initial);
    setCarrierId("none");
    setAutoNumbering(false);
    setIsGenerating(true);

    getRemittanceSettings(orgSlug).then((settings) => {
      if (settings.success && settings.data?.autoEnabled) {
        setAutoNumbering(true);
        Promise.all(
          selectedSales.map(() => generateRemittanceNumber(orgSlug))
        ).then((generated) => {
          setEntries((prev) =>
            prev.map((e, i) => ({
              ...e,
              remittanceNumber: generated[i]?.number ?? e.remittanceNumber,
            }))
          );
          setIsGenerating(false);
        });
      } else {
        setIsGenerating(false);
      }
    });
  }, [open, orgSlug, selectedSales]);

  const updateRemittance = (saleId: string, value: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.saleId === saleId ? { ...e, remittanceNumber: value } : e
      )
    );
  };

  const handleSubmit = async () => {
    const missing = entries.filter((e) => !e.remittanceNumber.trim());
    if (missing.length > 0) {
      toast.error("Completá el número de remito para todas las ventas");
      return;
    }
    if (requireCarrier && carrierId === "none") {
      toast.error("El transportista es obligatorio");
      return;
    }

    setIsPending(true);
    const result = await bulkDispatchSalesAction(
      orgSlug,
      entries.map((e) => ({
        saleId: e.saleId,
        saleNumber: e.saleNumber,
        remittanceNumber: e.remittanceNumber,
        carrierId: carrierId === "none" ? null : carrierId,
      }))
    );
    setIsPending(false);
    onOpenChange(false);

    if (result.error && result.results.length === 0) {
      toast.error(result.error);
      return;
    }

    setResults(result.results);
    const successCount = result.results.filter((r) => r.ok).length;
    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: salesQueryKey(orgSlug) });
      onSuccess();
    }
  };

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Despachar {selectedSales.length} venta
              {selectedSales.length !== 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>
              {autoNumbering
                ? "Los números de remito se generaron automáticamente. Podés editarlos antes de confirmar."
                : "Ingresá el número de remito para cada venta."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {carriers.length > 0 && (
              <div className="space-y-1.5">
                <Label>
                  Transportista{requireCarrier ? " *" : " (opcional)"}
                </Label>
                <Select onValueChange={setCarrierId} value={carrierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin transporte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin transporte</SelectItem>
                    {carriers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
              {entries.map((e) => (
                <div className="space-y-1" key={e.saleId}>
                  <Label className="text-muted-foreground text-xs">
                    {e.saleNumber} — {e.customerName}
                  </Label>
                  <Input
                    disabled={isGenerating}
                    onChange={(ev) =>
                      updateRemittance(e.saleId, ev.target.value)
                    }
                    placeholder={
                      isGenerating ? "Generando..." : "Ej: 0001-00012345"
                    }
                    value={e.remittanceNumber}
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={isPending || isGenerating}
              onClick={() => onOpenChange(false)}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={isPending || isGenerating} onClick={handleSubmit}>
              {isPending ? "Despachando..." : "Confirmar despacho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {results && (
        <BulkResultsDialog
          actionLabel="Despachar"
          onClose={() => setResults(null)}
          open={true}
          results={results}
        />
      )}
    </>
  );
}
