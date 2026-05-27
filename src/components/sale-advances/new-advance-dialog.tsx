"use client";

import { PlusIcon } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { createSaleAdvanceAction } from "@/modules/sale-advances/actions/sale-advances.actions";
import { toast } from "sonner";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

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

  const net = parseFloat(netAmount) || 0;
  const tax = Math.round(net * (parseFloat(taxRate) / 100) * 100) / 100;
  const total = net + tax;

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
        tax_rate: parseFloat(taxRate) / 100,
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
    <Dialog open={open} onOpenChange={setOpen}>
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: 50% anticipo OC #1234"
              rows={2}
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Importe neto</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={netAmount}
                onChange={(e) => setNetAmount(e.target.value)}
                step="0.01"
                min="0.01"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>IVA %</Label>
              <Input
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                step="0.5"
                min="0"
                max="100"
                disabled={isPending}
              />
            </div>
          </div>

          {net > 0 && (
            <>
              <Separator />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Neto</span>
                  <span className="tabular-nums">
                    {currencyFormatter.format(net)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>IVA {taxRate}%</span>
                  <span className="tabular-nums">
                    {currencyFormatter.format(tax)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total anticipo</span>
                  <span className="tabular-nums">
                    {currencyFormatter.format(total)}
                  </span>
                </div>
              </div>
            </>
          )}
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
            disabled={isPending || net <= 0 || !description.trim()}
          >
            {isPending ? "Creando..." : "Crear anticipo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
