"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { formatCurrency } from "@/lib/format";
import { createDebitNoteAction } from "@/modules/debit-notes/actions/create-debit-note.action";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";

type CreateDebitNoteDialogProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
};

const ELIGIBLE_STATUSES = new Set(["CONFIRMED", "DISPATCH", "DELIVERED"]);

export function CreateDebitNoteDialog({
  orgSlug,
  sales,
}: CreateDebitNoteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [salesOrderId, setSalesOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [observations, setObservations] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const eligibleSales = sales.filter((s) => ELIGIBLE_STATUSES.has(s.status));
  const selectedSale = eligibleSales.find((s) => s.id === salesOrderId);

  function reset() {
    setSalesOrderId("");
    setAmount("");
    setObservations("");
  }

  async function handleSubmit() {
    const parsedAmount = Number.parseFloat(amount);
    if (!salesOrderId || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Completá todos los campos requeridos");
      return;
    }

    const maxAmount = selectedSale
      ? Number(selectedSale.total_amount ?? 0)
      : undefined;

    if (maxAmount != null && parsedAmount > maxAmount) {
      toast.error(
        `El monto no puede superar el total de la venta (${formatCurrency(maxAmount)})`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createDebitNoteAction({
        orgSlug,
        salesOrderId,
        amount: parsedAmount,
        observations: observations.trim() || null,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Nota de débito ${result.debitNoteNumber} creada correctamente`
      );
      router.refresh();
      setOpen(false);
      reset();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          reset();
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 size-4" weight="bold" />
          Nueva nota de débito
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva nota de débito</DialogTitle>
          <DialogDescription>
            Seleccioná la venta de referencia e ingresá el monto a debitar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="nd-sale">Venta *</Label>
            <Select onValueChange={setSalesOrderId} value={salesOrderId}>
              <SelectTrigger id="nd-sale">
                <SelectValue placeholder="Seleccioná una venta..." />
              </SelectTrigger>
              <SelectContent>
                {eligibleSales.map((s) => {
                  const customerName =
                    s.customer?.fantasy_name ??
                    s.customer?.business_name ??
                    "—";
                  const label = s.invoice_number
                    ? `${s.invoice_number} — ${customerName}`
                    : `N°${s.sale_number} — ${customerName}`;
                  return (
                    <SelectItem key={s.id} value={s.id}>
                      {label} · {formatCurrency(Number(s.total_amount ?? 0))}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nd-amount">
              Monto *
              {selectedSale && (
                <span className="ml-1 font-normal text-muted-foreground text-xs">
                  (venta:{" "}
                  {formatCurrency(Number(selectedSale.total_amount ?? 0))})
                </span>
              )}
            </Label>
            <Input
              id="nd-amount"
              min={0.01}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step={0.01}
              type="number"
              value={amount}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nd-obs">
              Observaciones{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              id="nd-obs"
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setObservations(e.target.value)
              }
              placeholder="Motivo de la nota de débito..."
              rows={3}
              value={observations}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => {
              setOpen(false);
              reset();
            }}
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit} type="button">
            {isSubmitting ? "Creando..." : "Crear nota de débito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
