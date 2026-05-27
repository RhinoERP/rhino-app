"use client";

import {
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { createAdvanceReceiptAction } from "@/modules/sale-advances/actions/sale-advances.actions";
import {
  calculateReceiptSummary,
  RECEIPT_ITEM_LABELS,
  type ReceiptItemLine,
  type ReceiptItemType,
  RETENTION_RECEIPT_ITEMS,
} from "@/modules/sale-advances/types";
import { toast } from "sonner";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

type AdvanceReceiptDialogProps = {
  orgSlug: string;
  advanceId: string;
  advanceNumber: number;
  advanceTotal: number;
};

export function AdvanceReceiptDialog({
  orgSlug,
  advanceId,
  advanceNumber,
  advanceTotal,
}: AdvanceReceiptDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<ReceiptItemLine[]>([]);

  // Form para nuevo ítem
  const [newType, setNewType] = useState<ReceiptItemType>("check_third");
  const [newAmount, setNewAmount] = useState("");
  const [newRef, setNewRef] = useState("");
  const [newBank, setNewBank] = useState("");
  const [newDue, setNewDue] = useState("");

  const summary = calculateReceiptSummary(advanceTotal, items);

  function addItem() {
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("El importe debe ser mayor a cero");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        item_type: newType,
        amount,
        reference: newRef || undefined,
        bank_name: newBank || undefined,
        due_date: newDue || undefined,
      },
    ]);
    setNewAmount("");
    setNewRef("");
    setNewBank("");
    setNewDue("");
  }

  function handleSubmit() {
    if (!summary.isBalanced) {
      toast.error("El recibo debe cerrar en $0");
      return;
    }
    startTransition(async () => {
      const result = await createAdvanceReceiptAction({
        orgSlug,
        advance_id: advanceId,
        items: items.map(({ id: _id, ...i }) => i),
      });

      if (result.success) {
        toast.success("Cobro registrado. El anticipo quedó cobrado.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Error al registrar el cobro");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Registrar cobro
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recibo de cobro — Anticipo #{advanceNumber}</DialogTitle>
          <DialogDescription>
            Agregá los métodos de cobro y retenciones sufridas. El recibo debe
            cerrar en {currencyFormatter.format(advanceTotal)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Ítems agregados */}
          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <Badge
                      variant={
                        RETENTION_RECEIPT_ITEMS.includes(item.item_type)
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-xs"
                    >
                      {RECEIPT_ITEM_LABELS[item.item_type]}
                    </Badge>
                    {item.reference && (
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {item.reference}
                        {item.bank_name ? ` · ${item.bank_name}` : ""}
                        {item.due_date ? ` · Vence ${item.due_date}` : ""}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      RETENTION_RECEIPT_ITEMS.includes(item.item_type)
                        ? "text-destructive"
                        : ""
                    )}
                  >
                    {RETENTION_RECEIPT_ITEMS.includes(item.item_type)
                      ? "-"
                      : ""}
                    {currencyFormatter.format(item.amount)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() =>
                      setItems((p) => p.filter((i) => i.id !== item.id))
                    }
                  >
                    <TrashIcon className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Formulario nuevo ítem */}
          <div className="rounded-lg border border-dashed p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Agregar
            </p>
            <Select
              value={newType}
              onValueChange={(v) => setNewType(v as ReceiptItemType)}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(RECEIPT_ITEM_LABELS) as [
                    ReceiptItemType,
                    string,
                  ][]
                ).map(([type, label]) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Importe</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  step="0.01"
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-xs">Referencia</Label>
                <Input
                  placeholder="Nro cheque / CUIT..."
                  value={newRef}
                  onChange={(e) => setNewRef(e.target.value)}
                  className="h-8"
                />
              </div>
              {newType === "check_third" && (
                <>
                  <div>
                    <Label className="text-xs">Banco</Label>
                    <Input
                      placeholder="ICBC..."
                      value={newBank}
                      onChange={(e) => setNewBank(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Vencimiento</Label>
                    <Input
                      type="date"
                      value={newDue}
                      onChange={(e) => setNewDue(e.target.value)}
                      className="h-8"
                    />
                  </div>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={addItem}
            >
              <PlusIcon className="size-3.5" />
              Agregar
            </Button>
          </div>

          <Separator />

          {/* Balance */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Total anticipo</span>
              <span className="tabular-nums">
                {currencyFormatter.format(summary.advanceTotal)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Cobros</span>
              <span className="tabular-nums text-green-600">
                {currencyFormatter.format(summary.totalCollected)}
              </span>
            </div>
            {summary.totalRetentions > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Retenciones sufridas</span>
                <span className="tabular-nums text-red-600">
                  -{currencyFormatter.format(summary.totalRetentions)}
                </span>
              </div>
            )}
          </div>

          <div
            className={cn(
              "rounded-lg p-3 flex items-center gap-3",
              summary.isBalanced
                ? "bg-green-50 border border-green-200"
                : "bg-amber-50 border border-amber-200"
            )}
          >
            {summary.isBalanced ? (
              <CheckCircleIcon
                className="size-5 text-green-600 shrink-0"
                weight="fill"
              />
            ) : (
              <WarningCircleIcon
                className="size-5 text-amber-600 shrink-0"
                weight="fill"
              />
            )}
            <p
              className={cn(
                "text-sm font-semibold",
                summary.isBalanced ? "text-green-700" : "text-amber-700"
              )}
            >
              {summary.isBalanced
                ? "Recibo balanceado ✓"
                : `Diferencia: ${currencyFormatter.format(summary.balance)}`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!summary.isBalanced || items.length === 0 || isPending}
          >
            {isPending ? "Guardando..." : "Confirmar cobro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
