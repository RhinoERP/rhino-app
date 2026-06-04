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
import type { Customer } from "@/modules/customers/types";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import type { Supplier } from "@/modules/suppliers/types";

type CreateCreditNoteDialogProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
  customers: Customer[];
  suppliers: Supplier[];
  supplierDifferentiatedCredits: boolean;
};

const ELIGIBLE_STATUSES = new Set(["CONFIRMED", "DISPATCH", "DELIVERED"]);

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function saleLabel(s: SalesOrderWithCustomer) {
  const customerName =
    s.customer?.fantasy_name ?? s.customer?.business_name ?? "—";
  return s.invoice_number
    ? `${s.invoice_number} — ${customerName}`
    : `N°${s.sale_number} — ${customerName}`;
}

function SalePicker({
  eligibleSales,
  salesOrderId,
  setSalesOrderId,
  isOpen,
  setIsOpen,
  search,
  setSearch,
}: {
  eligibleSales: SalesOrderWithCustomer[];
  salesOrderId: string;
  setSalesOrderId: (id: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  search: string;
  setSearch: (val: string) => void;
}) {
  const selected = eligibleSales.find((s) => s.id === salesOrderId);

  return (
    <Popover
      onOpenChange={(v) => {
        setIsOpen(v);
        if (!v) {
          setSearch("");
        }
      }}
      open={isOpen}
    >
      <PopoverTrigger asChild>
        <Button
          aria-expanded={isOpen}
          className="w-full justify-between text-left font-normal"
          id="nc-sale"
          role="combobox"
          variant="outline"
        >
          <span className="truncate">
            {selected
              ? `${saleLabel(selected)} · ${formatCurrency(Number(selected.total_amount ?? 0))}`
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
            onValueChange={setSearch}
            placeholder="Buscar venta..."
            value={search}
          />
          <CommandList key={search}>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {eligibleSales.map((s) => {
                const label = saleLabel(s);
                const customerName =
                  s.customer?.fantasy_name ?? s.customer?.business_name ?? "—";
                const terms = normalizeSearchValue(
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
                      setIsOpen(false);
                    }}
                    value={terms}
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
                        salesOrderId === s.id ? "opacity-100" : "opacity-0"
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
  );
}

function CustomerPicker({
  customers,
  customerId,
  setCustomerId,
  isOpen,
  setIsOpen,
  search,
  setSearch,
}: {
  customers: Customer[];
  customerId: string;
  setCustomerId: (id: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  search: string;
  setSearch: (val: string) => void;
}) {
  const selected = customers.find((c) => c.id === customerId);

  return (
    <Popover
      onOpenChange={(v) => {
        setIsOpen(v);
        if (!v) {
          setSearch("");
        }
      }}
      open={isOpen}
    >
      <PopoverTrigger asChild>
        <Button
          aria-expanded={isOpen}
          className="w-full justify-between text-left font-normal"
          id="nc-customer"
          role="combobox"
          variant="outline"
        >
          <span className="truncate">
            {selected
              ? (selected.fantasy_name ??
                selected.business_name ??
                "Cliente sin nombre")
              : "Seleccioná un cliente..."}
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
            onValueChange={setSearch}
            placeholder="Buscar cliente..."
            value={search}
          />
          <CommandList key={search}>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {customers.map((c) => {
                const primaryLabel =
                  c.fantasy_name ?? c.business_name ?? "Cliente sin nombre";
                const businessName = c.business_name?.trim() ?? "";
                const terms = normalizeSearchValue(
                  [
                    primaryLabel,
                    c.fantasy_name ?? "",
                    c.business_name ?? "",
                  ].join(" ")
                );
                return (
                  <CommandItem
                    className="items-start"
                    key={c.id}
                    onSelect={() => {
                      setCustomerId(c.id);
                      setIsOpen(false);
                    }}
                    value={terms}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{primaryLabel}</p>
                      {businessName && businessName !== primaryLabel && (
                        <p className="truncate text-muted-foreground text-xs">
                          {businessName}
                        </p>
                      )}
                    </div>
                    <Check
                      className={cn(
                        "size-4 shrink-0 text-primary transition-opacity",
                        customerId === c.id ? "opacity-100" : "opacity-0"
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
  );
}

function SupplierPicker({
  suppliers,
  supplierId,
  setSupplierId,
  isOpen,
  setIsOpen,
  search,
  setSearch,
}: {
  suppliers: Supplier[];
  supplierId: string;
  setSupplierId: (id: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  search: string;
  setSearch: (val: string) => void;
}) {
  const selected = suppliers.find((s) => s.id === supplierId);

  return (
    <Popover
      onOpenChange={(v) => {
        setIsOpen(v);
        if (!v) {
          setSearch("");
        }
      }}
      open={isOpen}
    >
      <PopoverTrigger asChild>
        <Button
          aria-expanded={isOpen}
          className="w-full justify-between text-left font-normal"
          id="nc-supplier"
          role="combobox"
          variant="outline"
        >
          <span className="truncate">
            {selected?.name ?? "Seleccioná un proveedor..."}
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
            onValueChange={setSearch}
            placeholder="Buscar proveedor..."
            value={search}
          />
          <CommandList key={search}>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {suppliers.map((s) => {
                const terms = normalizeSearchValue(
                  [s.name, s.cuit ?? ""].join(" ")
                );
                return (
                  <CommandItem
                    key={s.id}
                    onSelect={() => {
                      setSupplierId(s.id);
                      setIsOpen(false);
                    }}
                    value={terms}
                  >
                    <span className="flex-1 truncate">
                      {s.name}
                      {s.cuit ? ` — CUIT: ${s.cuit}` : ""}
                    </span>
                    <Check
                      className={cn(
                        "size-4 shrink-0 text-primary transition-opacity",
                        supplierId === s.id ? "opacity-100" : "opacity-0"
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
  );
}

export function CreateCreditNoteDialog({
  orgSlug,
  sales,
  customers,
  suppliers,
  supplierDifferentiatedCredits,
}: CreateCreditNoteDialogProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"sale" | "direct">("sale");
  const [salesOrderId, setSalesOrderId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [observations, setObservations] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSalePickerOpen, setIsSalePickerOpen] = useState(false);
  const [saleSearch, setSaleSearch] = useState("");
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isSupplierPickerOpen, setIsSupplierPickerOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");

  const eligibleSales = sales.filter((s) => ELIGIBLE_STATUSES.has(s.status));
  const selectedSale =
    mode === "sale"
      ? eligibleSales.find((s) => s.id === salesOrderId)
      : undefined;
  const maxAmount = selectedSale
    ? Number(selectedSale.total_amount ?? 0)
    : undefined;

  function reset() {
    setSalesOrderId("");
    setCustomerId("");
    setSupplierId("");
    setAmount("");
    setObservations("");
    setIsSalePickerOpen(false);
    setIsCustomerPickerOpen(false);
    setIsSupplierPickerOpen(false);
    setSaleSearch("");
    setCustomerSearch("");
    setSupplierSearch("");
  }

  function validateForm(parsedAmount: number): string | null {
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return "Completá todos los campos requeridos";
    }
    return mode === "sale"
      ? validateSaleForm(parsedAmount)
      : validateDirectForm();
  }

  function validateSaleForm(parsedAmount: number): string | null {
    if (!salesOrderId) {
      return "Completá todos los campos requeridos";
    }
    if (maxAmount != null && parsedAmount > maxAmount) {
      return `El monto no puede superar el total de la venta (${formatCurrency(maxAmount)})`;
    }
    return null;
  }

  function validateDirectForm(): string | null {
    if (!customerId) {
      return "Completá todos los campos requeridos";
    }
    if (supplierDifferentiatedCredits && !supplierId) {
      return "Seleccioná un proveedor";
    }
    return null;
  }

  async function handleSubmit() {
    const parsedAmount = Number.parseFloat(amount);
    const error = validateForm(parsedAmount);
    if (error) {
      toast.error(error);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createCreditNoteAction({
        orgSlug,
        salesOrderId: mode === "sale" ? salesOrderId : null,
        amount: parsedAmount,
        observations: observations.trim() || null,
        isHistorical: mode === "direct",
        customerId: mode === "direct" ? customerId : undefined,
        supplierId: mode === "direct" ? supplierId || null : undefined,
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
            {mode === "sale"
              ? "Seleccioná la venta de referencia e ingresá el monto a acreditar."
              : "Seleccioná el cliente y el monto a acreditar."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex rounded-lg border p-1">
            <button
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
                mode === "sale"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                setMode("sale");
                setCustomerId("");
                setSupplierId("");
              }}
              type="button"
            >
              Con venta
            </button>
            <button
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
                mode === "direct"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                setMode("direct");
                setSalesOrderId("");
              }}
              type="button"
            >
              Sin venta
            </button>
          </div>

          {mode === "sale" ? (
            <div className="space-y-1.5">
              <Label htmlFor="nc-sale">Venta *</Label>
              <SalePicker
                eligibleSales={eligibleSales}
                isOpen={isSalePickerOpen}
                salesOrderId={salesOrderId}
                search={saleSearch}
                setIsOpen={setIsSalePickerOpen}
                setSalesOrderId={setSalesOrderId}
                setSearch={setSaleSearch}
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="nc-customer">Cliente *</Label>
                <CustomerPicker
                  customerId={customerId}
                  customers={customers}
                  isOpen={isCustomerPickerOpen}
                  search={customerSearch}
                  setCustomerId={setCustomerId}
                  setIsOpen={setIsCustomerPickerOpen}
                  setSearch={setCustomerSearch}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nc-supplier">
                  Proveedor
                  {supplierDifferentiatedCredits && (
                    <span className="text-red-500"> *</span>
                  )}
                </Label>
                <SupplierPicker
                  isOpen={isSupplierPickerOpen}
                  search={supplierSearch}
                  setIsOpen={setIsSupplierPickerOpen}
                  setSearch={setSupplierSearch}
                  setSupplierId={setSupplierId}
                  supplierId={supplierId}
                  suppliers={suppliers}
                />
              </div>
            </>
          )}

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
