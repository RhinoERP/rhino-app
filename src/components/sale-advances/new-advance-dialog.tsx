"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import { createSaleAdvanceAction } from "@/modules/sale-advances/actions/sale-advances.actions";

type NewAdvanceDialogProps = {
  orgSlug: string;
  quoteId?: string;
  quoteNumber?: string | number;
};

export function NewAdvanceDialog({
  orgSlug,
  quoteId,
  quoteNumber,
}: NewAdvanceDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [description, setDescription] = useState(
    quoteNumber ? `50% anticipo OC #${quoteNumber}` : "50% anticipo"
  );
  const [netAmount, setNetAmount] = useState("");
  const [taxRate, setTaxRate] = useState("21");

  const net = Number.parseFloat(netAmount) || 0;
  const tax = truncateMoney(net * (Number.parseFloat(taxRate) / 100));
  const total = truncateMoney(net + tax);

  function handleSubmit() {
    if (!description.trim() || net <= 0) {
      toast.error("Completá la descripción y el importe neto");
      return;
    }

    startTransition(async () => {
      const result = await createSaleAdvanceAction({
        orgSlug,
        description: description.trim(),
        net_amount: net,
        tax_rate: Number.parseFloat(taxRate) / 100,
        quote_id: quoteId,
      });

      if (result.success) {
        toast.success(
          `Anticipo #${result.data?.advance_number} creado correctamente`
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Error al crear el anticipo");
      }
    });
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <PlusIcon className="size-4" weight="bold" />
          Nuevo anticipo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Factura de anticipo</DialogTitle>
          <DialogDescription>
            Generá una factura de anticipo (generalmente 50% del pedido). El
            sistema calculará el IVA automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea
              disabled={isPending}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: 50% anticipo OC #1234"
              rows={2}
              value={description}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Importe neto</Label>
              <Input
                disabled={isPending}
                min="0.01"
                onChange={(e) => setNetAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={netAmount}
              />
            </div>
            <div className="space-y-1.5">
              <Label>IVA %</Label>
              <Input
                disabled={isPending}
                max="100"
                min="0"
                onChange={(e) => setTaxRate(e.target.value)}
                step="0.5"
                type="number"
                value={taxRate}
              />
            </div>
          </div>

          {net > 0 && (
            <>
              <Separator />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Neto</span>
                  <span className="tabular-nums">{formatCurrency(net)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>IVA {taxRate}%</span>
                  <span className="tabular-nums">{formatCurrency(tax)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total anticipo</span>
                  <span className="tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => setOpen(false)}
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            disabled={isPending || net <= 0 || !description.trim()}
            onClick={handleSubmit}
          >
            {isPending ? "Creando..." : "Crear anticipo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
