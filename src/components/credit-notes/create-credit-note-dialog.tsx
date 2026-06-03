"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createCreditNoteAction } from "@/modules/credit-notes/actions/create-credit-note.action";
import { creditNotesQueryKey } from "@/modules/credit-notes/queries/query-keys";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";

type CreateCreditNoteDialogProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
};

const ELIGIBLE_STATUSES = new Set(["CONFIRMED", "DISPATCH", "DELIVERED"]);

export function CreateCreditNoteDialog({
  orgSlug,
  sales,
}: CreateCreditNoteDialogProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [salesOrderId, setSalesOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [observations, setObservations] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSalePickerOpen, setIsSalePickerOpen] = useState(false);
  const [saleSearch, setSaleSearch] = useState("");

  const eligibleSales = sales.filter((s) => ELIGIBLE_STATUSES.has(s.status));

  const selectedSale = eligibleSales.find((s) => s.id === salesOrderId);
  const maxAmount = selectedSale
    ? Number(selectedSale.total_amount ?? 0)
    : undefined;

  const normalizeSearchValue = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  function reset() {
    setSalesOrderId("");
    setAmount("");
    setObservations("");
    setIsSalePickerOpen(false);
    setSaleSearch("");
  }

  async function handleSubmit() {
    const parsedAmount = Number.parseFloat(amount);
    if (!salesOrderId || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Completá todos los campos requeridos");
      return;
    }
    if (maxAmount != null && parsedAmount > maxAmount) {
      toast.error(
        `El monto no puede superar el total de la venta (${formatCurrency(maxAmount)})`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createCreditNoteAction({
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
        `Nota de crédito ${result.creditNoteNumber} creada correctamente`
      );
      await queryClient.invalidateQueries({
        queryKey: creditNotesQueryKey(orgSlug),
      });
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
          Nueva nota de crédito
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva nota de crédito</DialogTitle>
          <DialogDescription>
            Seleccioná la venta de referencia e ingresá el monto a acreditar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="nc-sale">Venta *</Label>
            <Popover
              onOpenChange={(isOpen) => {
                setIsSalePickerOpen(isOpen);
                if (!isOpen) {
                  setSaleSearch("");
                }
              }}
              open={isSalePickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  aria-expanded={isSalePickerOpen}
                  className="w-full justify-between text-left font-normal"
                  id="nc-sale"
                  role="combobox"
                  variant="outline"
                >
                  <span className="truncate">
                    {selectedSale
                      ? (() => {
                          const customerName =
                            selectedSale.customer?.fantasy_name ??
                            selectedSale.customer?.business_name ??
                            "—";
                          const label = selectedSale.invoice_number
                            ? `${selectedSale.invoice_number} — ${customerName}`
                            : `N°${selectedSale.sale_number} — ${customerName}`;
                          return `${label} · ${formatCurrency(Number(selectedSale.total_amount ?? 0))}`;
                        })()
                      : "Seleccioná una venta..."}
                  </span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-full max-w-[90vw] p-0"
                onWheel={(e) => e.stopPropagation()}
                sideOffset={8}
              >
                <Command>
                  <CommandInput
                    onValueChange={setSaleSearch}
                    placeholder="Buscar venta..."
                    value={saleSearch}
                  />
                  <CommandList key={saleSearch}>
                    <CommandEmpty>Sin resultados.</CommandEmpty>
                    <CommandGroup>
                      {eligibleSales.map((s) => {
                        const customerName =
                          s.customer?.fantasy_name ??
                          s.customer?.business_name ??
                          "—";
                        const label = s.invoice_number
                          ? `${s.invoice_number} — ${customerName}`
                          : `N°${s.sale_number} — ${customerName}`;
                        const searchTerms = normalizeSearchValue(
                          [
                            label,
                            s.sale_number?.toString() ?? "",
                            customerName,
                            s.invoice_number ?? "",
                          ].join(" ")
                        );
                        return (
                          <CommandItem
                            key={s.id}
                            onSelect={() => {
                              setSalesOrderId(s.id);
                              setIsSalePickerOpen(false);
                            }}
                            value={searchTerms}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{label}</p>
                              <p className="truncate text-muted-foreground text-xs">
                                {formatCurrency(Number(s.total_amount ?? 0))}
                              </p>
                            </div>
                            <Check
                              className={cn(
                                "size-4 shrink-0 text-primary transition-opacity",
                                salesOrderId === s.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-amount">
              Monto *
              {maxAmount != null && (
                <span className="ml-1 font-normal text-muted-foreground text-xs">
                  (máx. {formatCurrency(maxAmount)})
                </span>
              )}
            </Label>
            <Input
              id="nc-amount"
              max={maxAmount}
              min={0.01}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step={0.01}
              type="number"
              value={amount}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-obs">
              Observaciones{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              id="nc-obs"
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setObservations(e.target.value)
              }
              placeholder="Motivo de la nota de crédito..."
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
            {isSubmitting ? "Creando..." : "Crear nota de crédito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
