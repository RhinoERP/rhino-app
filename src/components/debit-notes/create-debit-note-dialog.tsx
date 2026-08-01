"use client";

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { createDebitNoteAction } from "@/modules/debit-notes/actions/manage-debit-note.action";
import { calculateDebitNoteBreakdown } from "@/modules/debit-notes/debit-note-calculations";
import type {
  CreateDebitNoteItemInput,
  DebitNoteReason,
} from "@/modules/debit-notes/types";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import type { Tax } from "@/modules/taxes/types";

const REASONS: Array<{ value: DebitNoteReason; label: string }> = [
  { value: "INTEREST", label: "Interés" },
  { value: "FREIGHT_OR_POST_CHARGE", label: "Flete o cargo posterior" },
  { value: "PRICE_DIFFERENCE", label: "Diferencia de precio" },
  { value: "OTHER", label: "Otro" },
];
const SUPPORTED_TYPES = new Set([
  "FACTURA_A",
  "FACTURA_A_RETENCION",
  "FACTURA_B",
  "FACTURA_C",
]);
const emptyItem = (): CreateDebitNoteItemInput => ({
  id: globalThis.crypto.randomUUID(),
  description: "",
  quantity: 1,
  unitPrice: 0,
  taxes: [],
});

function DebitNoteTaxPicker({
  itemId,
  selectedTaxes,
  taxes,
  onChange,
}: {
  itemId: string;
  selectedTaxes: NonNullable<CreateDebitNoteItemInput["taxes"]>;
  taxes: Tax[];
  onChange: (taxes: NonNullable<CreateDebitNoteItemInput["taxes"]>) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedTaxIds = selectedTaxes.map((tax) => tax.taxId);
  const primaryTax = selectedTaxes[0] ?? null;
  const remainingTaxesCount = Math.max(0, selectedTaxes.length - 1);
  const toggleTax = (tax: Tax) => {
    if (selectedTaxIds.includes(tax.id)) {
      onChange(selectedTaxes.filter((selected) => selected.taxId !== tax.id));
      return;
    }
    onChange([
      ...selectedTaxes,
      {
        taxId: tax.id,
        name: tax.name,
        rate: Number(tax.rate),
        taxCodeSnapshot: tax.code,
      },
    ]);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          aria-label="Impuestos"
          className="h-10 w-full justify-between overflow-hidden text-left font-normal"
          id={`debit-item-taxes-${itemId}`}
          role="combobox"
          type="button"
          variant="outline"
        >
          <div className="flex min-w-0 items-center gap-1.5 pr-2">
            {primaryTax ? (
              <>
                <Badge className="min-w-0 shrink rounded-sm" variant="outline">
                  <span className="truncate">
                    {primaryTax.name} ({primaryTax.rate}%)
                  </span>
                  <span
                    aria-hidden="true"
                    className="ml-1 flex size-5 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-muted"
                    onClick={(event) => {
                      event.stopPropagation();
                      const configuredTax = taxes.find(
                        (candidate) => candidate.id === primaryTax.taxId
                      );
                      if (configuredTax) {
                        toggleTax(configuredTax);
                      }
                    }}
                  >
                    <X className="size-3" />
                  </span>
                </Badge>
                {remainingTaxesCount > 0 ? (
                  <Badge className="shrink-0 rounded-sm" variant="secondary">
                    +{remainingTaxesCount}
                  </Badge>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">
                Seleccionar impuestos
              </span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
        sideOffset={8}
      >
        <Command>
          <CommandInput placeholder="Buscar impuesto..." />
          <CommandList>
            <CommandEmpty>No se encontraron impuestos.</CommandEmpty>
            <CommandGroup>
              {taxes.map((tax) => (
                <CommandItem
                  key={tax.id}
                  onSelect={() => toggleTax(tax)}
                  value={`${tax.name} ${tax.rate}`}
                >
                  <span className="flex-1 truncate">
                    {tax.name} ({tax.rate}%)
                  </span>
                  {selectedTaxIds.includes(tax.id) ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CreateDebitNoteDialog({
  orgSlug,
  sales,
  taxes,
}: {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
  taxes: Tax[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saleId, setSaleId] = useState("");
  const [concept, setConcept] = useState("");
  const [items, setItems] = useState<CreateDebitNoteItemInput[]>([emptyItem()]);
  const [dueDate, setDueDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [paymentCondition, setPaymentCondition] = useState<
    "CASH" | "CURRENT_ACCOUNT"
  >("CURRENT_ACCOUNT");
  const [externalReference, setExternalReference] = useState("");
  const [reason, setReason] = useState<DebitNoteReason>("INTEREST");
  const [reasonDetail, setReasonDetail] = useState("");
  const [observations, setObservations] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const eligibleSales = useMemo(
    () =>
      sales.filter(
        (sale) =>
          sale.arca_status === "authorized" &&
          sale.status !== "CANCELLED" &&
          SUPPORTED_TYPES.has(sale.invoice_type)
      ),
    [sales]
  );
  const breakdown = useMemo(() => {
    try {
      return calculateDebitNoteBreakdown(items);
    } catch {
      return null;
    }
  }, [items]);
  const updateItem = (
    index: number,
    value: Partial<CreateDebitNoteItemInput>
  ) =>
    setItems((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...value } : item
      )
    );
  const reset = () => {
    setSaleId("");
    setConcept("");
    setItems([emptyItem()]);
    setDueDate(new Date().toISOString().slice(0, 10));
    setPaymentCondition("CURRENT_ACCOUNT");
    setExternalReference("");
    setReason("INTEREST");
    setReasonDetail("");
    setObservations("");
  };
  const submit = async () => {
    if (!(saleId && concept.trim() && dueDate && breakdown)) {
      toast.error(
        "Completá la factura, el concepto, los ítems y el vencimiento."
      );
      return;
    }
    if (reason === "OTHER" && !reasonDetail.trim()) {
      toast.error("Detallá el motivo Otro.");
      return;
    }
    setIsSubmitting(true);
    const result = await createDebitNoteAction({
      orgSlug,
      salesOrderId: saleId,
      concept,
      dueDate,
      paymentCondition,
      externalReference,
      items,
      reason,
      reasonDetail,
      observations,
    });
    setIsSubmitting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Borrador de Nota de Débito creado.");
    setOpen(false);
    reset();
    router.push(`/org/${orgSlug}/notas-de-debito/${result.debitNote.id}`);
    router.refresh();
  };
  return (
    <Dialog
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          reset();
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 size-4" weight="bold" />
          Nueva Nota de Débito
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nueva Nota de Débito</DialogTitle>
          <DialogDescription>
            Genera un cargo fiscal adicional sobre una única factura ARCA
            autorizada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="debit-sale">Factura origen *</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              id="debit-sale"
              onChange={(event) => setSaleId(event.target.value)}
              value={saleId}
            >
              <option value="">Seleccioná una factura...</option>
              {eligibleSales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.invoice_number ?? `Venta N°${sale.sale_number}`} —{" "}
                  {sale.customer.fantasy_name ?? sale.customer.business_name} ·{" "}
                  {formatCurrency(Number(sale.total_amount))}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debit-concept">Motivo del ajuste *</Label>
            <Input
              id="debit-concept"
              onChange={(event) => setConcept(event.target.value)}
              placeholder="Ej.: Cargo adicional por envío omitido"
              value={concept}
            />
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Ítems e impuestos *</Label>
              <Button
                onClick={() => setItems((current) => [...current, emptyItem()])}
                size="sm"
                type="button"
                variant="outline"
              >
                Agregar ítem
              </Button>
            </div>
            <div className="hidden gap-2 px-2 text-muted-foreground text-xs md:grid md:grid-cols-[1fr_92px_120px_1fr_auto]">
              <span>Descripción</span>
              <span>Cantidad</span>
              <span>Precio unitario</span>
              <span>Impuestos</span>
              <span className="w-10" />
            </div>
            {items.map((item, index) => (
              <div
                className="grid gap-2 rounded border p-2 md:grid-cols-[1fr_92px_120px_1fr_auto]"
                key={item.id}
              >
                <Input
                  aria-label="Descripción"
                  onChange={(event) =>
                    updateItem(index, { description: event.target.value })
                  }
                  placeholder="Descripción"
                  value={item.description}
                />
                <Input
                  aria-label="Cantidad"
                  min="0.01"
                  onChange={(event) =>
                    updateItem(index, { quantity: Number(event.target.value) })
                  }
                  onFocus={(event) => event.currentTarget.select()}
                  step="0.01"
                  type="number"
                  value={item.quantity}
                />
                <Input
                  aria-label="Precio unitario"
                  min="0"
                  onChange={(event) =>
                    updateItem(index, { unitPrice: Number(event.target.value) })
                  }
                  onFocus={(event) => event.currentTarget.select()}
                  step="0.01"
                  type="number"
                  value={item.unitPrice}
                />
                <DebitNoteTaxPicker
                  itemId={item.id ?? String(index)}
                  onChange={(selectedTaxes) =>
                    updateItem(index, { taxes: selectedTaxes })
                  }
                  selectedTaxes={item.taxes ?? []}
                  taxes={taxes}
                />
                <Button
                  aria-label="Eliminar ítem"
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((current) =>
                      current.filter(
                        (_, currentIndex) => currentIndex !== index
                      )
                    )
                  }
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <TrashIcon className="size-4" />
                </Button>
              </div>
            ))}
            {breakdown ? (
              <div className="flex flex-wrap justify-end gap-x-5 gap-y-1 text-sm">
                <span>Neto: {formatCurrency(breakdown.netAmount)}</span>
                <span>Impuestos: {formatCurrency(breakdown.taxAmount)}</span>
                <strong>Total: {formatCurrency(breakdown.totalAmount)}</strong>
              </div>
            ) : (
              <p className="text-destructive text-sm">
                Revisá los ítems ingresados.
              </p>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="debit-due-date">Vencimiento *</Label>
              <Input
                id="debit-due-date"
                onChange={(event) => setDueDate(event.target.value)}
                type="date"
                value={dueDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debit-condition">Condición de pago *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id="debit-condition"
                onChange={(event) =>
                  setPaymentCondition(
                    event.target.value as "CASH" | "CURRENT_ACCOUNT"
                  )
                }
                value={paymentCondition}
              >
                <option value="CURRENT_ACCOUNT">Cuenta corriente</option>
                <option value="CASH">Contado</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debit-reference">
              Referencia externa (opcional)
            </Label>
            <Input
              id="debit-reference"
              onChange={(event) => setExternalReference(event.target.value)}
              placeholder="Ej.: OC-1234, remito 567"
              value={externalReference}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="debit-reason">Motivo *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id="debit-reason"
                onChange={(event) =>
                  setReason(event.target.value as DebitNoteReason)
                }
                value={reason}
              >
                {REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {reason === "OTHER" ? (
              <div className="space-y-1.5">
                <Label htmlFor="debit-reason-detail">
                  Detalle del motivo *
                </Label>
                <Input
                  id="debit-reason-detail"
                  onChange={(event) => setReasonDetail(event.target.value)}
                  value={reasonDetail}
                />
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debit-observations">Observaciones</Label>
            <Textarea
              id="debit-observations"
              onChange={(event) => setObservations(event.target.value)}
              value={observations}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={isSubmitting} onClick={submit} type="button">
            {isSubmitting ? "Guardando..." : "Crear borrador"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
