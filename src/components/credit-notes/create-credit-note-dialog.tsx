"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AsientoModal } from "@/components/accounting/asiento-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AnyEvento } from "@/modules/accounting/types";
import {
  createCreditNoteAction,
  markCreditNoteAccountingJournalAction,
} from "@/modules/credit-notes/actions/create-credit-note.action";
import { createReturnCreditNoteAction } from "@/modules/credit-notes/actions/create-return-credit-note.action";
import { getReturnCreditNoteSaleDetailAction } from "@/modules/credit-notes/actions/get-return-credit-note-sale-detail.action";
import { creditNotesQueryKey } from "@/modules/credit-notes/queries/query-keys";
import type { Customer } from "@/modules/customers/types";
import { isAuthorizedPreventaInvoice } from "@/modules/sales/preventa-invoicing";
import type {
  SalesOrderDetail,
  SalesOrderItemDetail,
  SalesOrderWithCustomer,
} from "@/modules/sales/service/sales.service";
import type { Supplier } from "@/modules/suppliers/types";
import type { Database } from "@/types/supabase";

type CreateCreditNoteDialogProps = {
  orgSlug: string;
  sales: SalesOrderWithCustomer[];
  customers: Customer[];
  suppliers: Supplier[];
  supplierDifferentiatedCredits: boolean;
};

const ELIGIBLE_STATUSES = new Set(["CONFIRMED", "DISPATCH", "DELIVERED"]);
const RETURN_ELIGIBLE_STATUSES = new Set(["DISPATCH", "DELIVERED"]);
const TRAILING_DECIMAL_ZEROES_REGEX = /\.?0+$/;

type ReturnedItemCondition =
  Database["public"]["Enums"]["returned_item_condition"];

type ReturnItemState = {
  returnQuantity: number;
  unitQuantity?: number;
  rawWeightStr?: string;
  rawUnitsStr?: string;
  itemCondition: ReturnedItemCondition;
};

const RETURN_CONDITION_OPTIONS: Array<{
  value: ReturnedItemCondition;
  label: string;
  restocks: boolean;
}> = [
  { value: "GOOD", label: "Vendible", restocks: true },
  { value: "DAMAGED", label: "Dañado", restocks: false },
  { value: "EXPIRED", label: "Vencido", restocks: false },
  { value: "WRONG_PRODUCT", label: "Producto equivocado", restocks: false },
  { value: "OTHER", label: "Otro", restocks: false },
];

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

function getPricePerKg(item: SalesOrderItemDetail): number {
  const weight = item.weightQuantity;
  if (!weight) {
    return 0;
  }

  return item.subtotal / weight;
}

function getWeightLabel(item: SalesOrderItemDetail): string {
  return item.unitOfMeasure === "LT" ? "Lt" : "Kg";
}

function getReturnQuantityBasis(item: SalesOrderItemDetail): number {
  return item.tracksStockUnits ? (item.weightQuantity ?? 0) : item.quantity;
}

function formatQuantity(value: number | null | undefined): string {
  const numericValue = Number(value ?? 0);
  return Number.isInteger(numericValue)
    ? numericValue.toString()
    : numericValue.toFixed(3).replace(TRAILING_DECIMAL_ZEROES_REGEX, "");
}

function resolveClampedRawValue(params: {
  rawValue: string;
  parsedValue: number;
  clampedValue: number;
}): string {
  if (params.rawValue === "") {
    return "";
  }

  if (params.parsedValue === params.clampedValue) {
    return params.rawValue;
  }

  return formatQuantity(params.clampedValue);
}

function calculateReturnLineTotal(params: {
  item: SalesOrderItemDetail;
  sale: SalesOrderDetail | null;
  returnQuantity: number;
}): number {
  const { item, sale, returnQuantity } = params;
  const quantityBasis = getReturnQuantityBasis(item);
  if (quantityBasis <= 0 || returnQuantity <= 0) {
    return 0;
  }

  const subtotalAfterLineDiscount = truncateMoney(
    (item.subtotal / quantityBasis) * returnQuantity
  );
  const saleSubtotal = truncateMoney(Number(sale?.sub_total ?? 0));
  const globalDiscountAmount = truncateMoney(
    Math.max(0, Number(sale?.global_discount_amount ?? 0))
  );
  const itemGlobalDiscountShare =
    saleSubtotal > 0
      ? truncateMoney((item.subtotal / saleSubtotal) * globalDiscountAmount)
      : 0;
  const globalDiscountPerUnit =
    quantityBasis > 0 ? itemGlobalDiscountShare / quantityBasis : 0;
  const globalDiscountLineAmount = truncateMoney(
    Math.min(subtotalAfterLineDiscount, globalDiscountPerUnit * returnQuantity)
  );
  const netAmount = truncateMoney(
    Math.max(0, subtotalAfterLineDiscount - globalDiscountLineAmount)
  );
  const itemTaxRate =
    item.taxes && item.taxes.length > 0
      ? item.taxes.reduce((sum, tax) => sum + Number(tax.rate ?? 0), 0)
      : (sale?.taxes ?? []).reduce(
          (sum, tax) => sum + Number(tax.rate ?? 0),
          0
        );
  const taxAmount = truncateMoney(netAmount * (itemTaxRate / 100));

  return truncateMoney(netAmount + taxAmount);
}

function getRemainingReturnQuantity(
  item: SalesOrderItemDetail,
  returnedQuantities: Record<string, number>
): number {
  const alreadyReturned = returnedQuantities[item.id] ?? 0;
  if (item.tracksStockUnits) {
    return Math.max(0, (item.weightQuantity ?? 0) - alreadyReturned);
  }

  return Math.max(0, item.quantity - alreadyReturned);
}

function getRemainingReturnUnits(
  item: SalesOrderItemDetail,
  returnedUnitQuantities: Record<string, number>
): number {
  return Math.max(0, item.quantity - (returnedUnitQuantities[item.id] ?? 0));
}

function getReturnableItems(
  sale: SalesOrderDetail | null,
  returnedQuantities: Record<string, number>
): SalesOrderItemDetail[] {
  if (!sale) {
    return [];
  }

  return sale.items
    .filter((item) => item.productId != null && item.type !== "adjustment")
    .filter((item) => getRemainingReturnQuantity(item, returnedQuantities) > 0);
}

function buildInitialReturnItemStates(
  items: SalesOrderItemDetail[]
): Record<string, ReturnItemState> {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      { returnQuantity: 0, itemCondition: "GOOD" as ReturnedItemCondition },
    ])
  );
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

function ReturnItemRow({
  item,
  state,
  remainingQty,
  remainingUnits,
  onQuantityChange,
  onWeightChange,
  onUnitsChange,
  onConditionChange,
  lineTotal,
}: {
  item: SalesOrderItemDetail;
  state: ReturnItemState;
  remainingQty: number;
  remainingUnits: number;
  lineTotal: number;
  onQuantityChange: (itemId: string, value: string) => void;
  onWeightChange: (itemId: string, value: string) => void;
  onUnitsChange: (itemId: string, value: string) => void;
  onConditionChange: (itemId: string, value: ReturnedItemCondition) => void;
}) {
  const price = item.tracksStockUnits ? getPricePerKg(item) : item.unitPrice;
  const condition = RETURN_CONDITION_OPTIONS.find(
    (option) => option.value === state.itemCondition
  );
  const weightLabel = getWeightLabel(item).toLowerCase();
  const formattedRemainingQty = formatQuantity(remainingQty);
  const formattedPurchasedQty = formatQuantity(item.quantity);
  const formattedPurchasedWeight = formatQuantity(item.weightQuantity);

  return (
    <div className="space-y-3 border-b py-3 last:border-b-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{item.name}</p>
          {item.description && item.description !== item.name && (
            <p className="truncate text-muted-foreground text-xs">
              {item.description}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            {item.tracksStockUnits
              ? `${formattedRemainingQty} ${weightLabel} disponibles de ${formattedPurchasedWeight} ${weightLabel} · ${formatCurrency(price)}/${weightLabel}`
              : `${formattedRemainingQty} disponibles de ${formattedPurchasedQty} · ${formatCurrency(price)} c/u`}
          </p>
          <p className="text-muted-foreground text-xs">
            {item.tracksStockUnits
              ? `Comprado: ${formattedPurchasedQty} uds · ${formattedPurchasedWeight} ${weightLabel} · ${formatCurrency(item.subtotal)} subtotal`
              : `Comprado: ${formattedPurchasedQty} unidades · ${formatCurrency(item.subtotal)} subtotal`}
          </p>
        </div>

        {item.tracksStockUnits ? (
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-muted-foreground text-xs">Uds</Label>
            <Input
              className="h-9 w-20 text-center"
              max={remainingUnits}
              min={0}
              onChange={(event) => onUnitsChange(item.id, event.target.value)}
              placeholder="0"
              step={1}
              type="number"
              value={state.rawUnitsStr ?? ""}
            />
            <Label className="text-muted-foreground text-xs">
              {getWeightLabel(item)}
            </Label>
            <Input
              className="h-9 w-24 text-center"
              max={remainingQty}
              min={0}
              onChange={(event) => onWeightChange(item.id, event.target.value)}
              placeholder="0"
              step={0.001}
              type="number"
              value={state.rawWeightStr ?? ""}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground text-xs">Cantidad</Label>
            <Input
              className="h-9 w-20 text-center"
              max={remainingQty}
              min={0}
              onChange={(event) =>
                onQuantityChange(item.id, event.target.value)
              }
              placeholder="0"
              type="number"
              value={state.returnQuantity === 0 ? "" : state.returnQuantity}
            />
          </div>
        )}
      </div>

      {state.returnQuantity > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-sm">Condición</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              onChange={(event) =>
                onConditionChange(
                  item.id,
                  event.target.value as ReturnedItemCondition
                )
              }
              value={state.itemCondition}
            >
              {RETURN_CONDITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Checkbox checked={condition?.restocks ?? false} disabled />
              Reingresa stock
            </span>
          </div>
          <span className="font-medium text-sm">
            {formatCurrency(lineTotal)}
          </span>
        </div>
      )}
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: this dialog coordinates three distinct NC creation flows.
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
  const [accountingPayload, setAccountingPayload] = useState<AnyEvento | null>(
    null
  );
  const [accountingCreditNoteId, setAccountingCreditNoteId] = useState<
    string | null
  >(null);
  const [mode, setMode] = useState<"sale" | "direct" | "return">("sale");
  const [salesOrderId, setSalesOrderId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [observations, setObservations] = useState("");
  const [applyToReceivable, setApplyToReceivable] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnSale, setReturnSale] = useState<SalesOrderDetail | null>(null);
  const [returnedQuantities, setReturnedQuantities] = useState<
    Record<string, number>
  >({});
  const [returnedUnitQuantities, setReturnedUnitQuantities] = useState<
    Record<string, number>
  >({});
  const [existingReturnCreditNoteTotal, setExistingReturnCreditNoteTotal] =
    useState(0);
  const [returnItemStates, setReturnItemStates] = useState<
    Record<string, ReturnItemState>
  >({});
  const [isLoadingReturnSale, setIsLoadingReturnSale] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSalePickerOpen, setIsSalePickerOpen] = useState(false);
  const [saleSearch, setSaleSearch] = useState("");
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isSupplierPickerOpen, setIsSupplierPickerOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");

  const eligibleSales = sales.filter(
    (sale) =>
      ELIGIBLE_STATUSES.has(sale.status) ||
      isAuthorizedPreventaInvoice(sale.status, sale.arca_status)
  );
  const returnEligibleSales = sales.filter((s) =>
    RETURN_ELIGIBLE_STATUSES.has(s.status)
  );
  const selectedSale =
    mode === "sale"
      ? eligibleSales.find((s) => s.id === salesOrderId)
      : undefined;
  const maxAmount = selectedSale
    ? Number(selectedSale.total_amount ?? 0)
    : undefined;
  const selectedSalePendingBalance = Number(
    selectedSale?.receivable?.pending_balance ?? 0
  );
  const canApplyToReceivable = selectedSalePendingBalance > 0;
  const shouldApplyToReceivable =
    mode === "sale" && canApplyToReceivable && applyToReceivable;
  const dialogDescription =
    mode === "return"
      ? "Seleccioná la venta y los productos devueltos."
      : "Seleccioná el cliente y el monto a acreditar.";
  const resolvedDialogDescription =
    mode === "sale"
      ? "Seleccioná la venta de referencia e ingresá el monto a acreditar."
      : dialogDescription;
  const submitLabel =
    mode === "return" ? "Crear NC por devolución" : "Crear nota de crédito";
  const returnableItems = useMemo(
    () => getReturnableItems(returnSale, returnedQuantities),
    [returnSale, returnedQuantities]
  );
  const returnTotal = useMemo(
    () =>
      returnableItems.reduce((total, item) => {
        const state = returnItemStates[item.id];
        if (!state) {
          return total;
        }
        return (
          total +
          calculateReturnLineTotal({
            item,
            sale: returnSale,
            returnQuantity: state.returnQuantity,
          })
        );
      }, 0),
    [returnItemStates, returnSale, returnableItems]
  );
  const hasAnyReturn = returnTotal > 0;

  useEffect(() => {
    if (!(open && mode === "return" && salesOrderId)) {
      return;
    }

    let cancelled = false;
    setIsLoadingReturnSale(true);
    setReturnSale(null);
    setReturnedQuantities({});
    setReturnedUnitQuantities({});
    setExistingReturnCreditNoteTotal(0);
    setReturnItemStates({});

    getReturnCreditNoteSaleDetailAction(orgSlug, salesOrderId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        const items = getReturnableItems(
          result.data.sale,
          result.data.returnedQuantities
        );
        setReturnSale(result.data.sale);
        setReturnedQuantities(result.data.returnedQuantities);
        setReturnedUnitQuantities(result.data.returnedUnitQuantities);
        setExistingReturnCreditNoteTotal(
          result.data.existingReturnCreditNoteTotal
        );
        setReturnItemStates(buildInitialReturnItemStates(items));
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingReturnSale(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, open, orgSlug, salesOrderId]);

  function reset() {
    setSalesOrderId("");
    setCustomerId("");
    setSupplierId("");
    setAmount("");
    setObservations("");
    setApplyToReceivable(false);
    setReturnReason("");
    setReturnNotes("");
    setReturnSale(null);
    setReturnedQuantities({});
    setReturnedUnitQuantities({});
    setExistingReturnCreditNoteTotal(0);
    setReturnItemStates({});
    setIsLoadingReturnSale(false);
    setIsSalePickerOpen(false);
    setIsCustomerPickerOpen(false);
    setIsSupplierPickerOpen(false);
    setSaleSearch("");
    setCustomerSearch("");
    setSupplierSearch("");
  }

  function handleManualSaleSelection(id: string) {
    const sale = eligibleSales.find((candidate) => candidate.id === id);
    setSalesOrderId(id);
    setApplyToReceivable(Number(sale?.receivable?.pending_balance ?? 0) > 0);
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

  function handleReturnQuantityChange(itemId: string, value: string) {
    const item = returnableItems.find((returnable) => returnable.id === itemId);
    if (!item) {
      return;
    }

    const remainingQty = getRemainingReturnQuantity(item, returnedQuantities);
    const parsed = Number.parseInt(value, 10);
    const clamped = Number.isNaN(parsed)
      ? 0
      : Math.min(Math.max(0, parsed), remainingQty);

    setReturnItemStates((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], returnQuantity: clamped },
    }));
  }

  function handleReturnWeightChange(itemId: string, value: string) {
    const item = returnableItems.find((returnable) => returnable.id === itemId);
    if (!item) {
      return;
    }

    const remainingQty = getRemainingReturnQuantity(item, returnedQuantities);
    const parsed = Number.parseFloat(value);
    const clamped = Number.isNaN(parsed)
      ? 0
      : Math.min(Math.max(0, parsed), remainingQty);
    const rawWeightStr = resolveClampedRawValue({
      rawValue: value,
      parsedValue: parsed,
      clampedValue: clamped,
    });

    setReturnItemStates((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        returnQuantity: clamped,
        rawWeightStr,
      },
    }));
  }

  function handleReturnUnitsChange(itemId: string, value: string) {
    const item = returnableItems.find((returnable) => returnable.id === itemId);
    if (!item) {
      return;
    }

    const remainingUnits = getRemainingReturnUnits(
      item,
      returnedUnitQuantities
    );
    const parsed = Number.parseInt(value, 10);
    const unitQuantity = Number.isNaN(parsed)
      ? 0
      : Math.min(Math.max(0, parsed), remainingUnits);
    const rawUnitsStr = resolveClampedRawValue({
      rawValue: value,
      parsedValue: parsed,
      clampedValue: unitQuantity,
    });

    setReturnItemStates((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        unitQuantity,
        rawUnitsStr,
      },
    }));
  }

  function handleReturnConditionChange(
    itemId: string,
    itemCondition: ReturnedItemCondition
  ) {
    setReturnItemStates((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], itemCondition },
    }));
  }

  async function handleReturnSubmit() {
    if (!(salesOrderId && returnSale)) {
      toast.error("Seleccioná una venta");
      return;
    }
    if (!hasAnyReturn) {
      toast.error("Seleccioná al menos un producto a devolver");
      return;
    }
    if (!returnReason.trim()) {
      toast.error("Ingresá el motivo de la devolución");
      return;
    }

    const invalidTrackedItem = returnableItems.find((item) => {
      if (!item.tracksStockUnits) {
        return false;
      }
      const state = returnItemStates[item.id];
      if (!state || state.returnQuantity <= 0) {
        return false;
      }
      const remainingWeight = getRemainingReturnQuantity(
        item,
        returnedQuantities
      );
      const remainingUnits = getRemainingReturnUnits(
        item,
        returnedUnitQuantities
      );
      return (
        state.returnQuantity - remainingWeight > 0.000_001 ||
        (state.unitQuantity ?? 0) <= 0 ||
        (state.unitQuantity ?? 0) - remainingUnits > 0.000_001
      );
    });

    if (invalidTrackedItem) {
      toast.error(
        `Revisá unidades y ${getWeightLabel(invalidTrackedItem).toLowerCase()} de ${invalidTrackedItem.name}: no pueden superar lo comprado.`
      );
      return;
    }

    const items = returnableItems
      .map((item) => {
        const state = returnItemStates[item.id];
        return {
          salesOrderItemId: item.id,
          productId: item.productId as string,
          quantity: state?.returnQuantity ?? 0,
          unitPrice: item.tracksStockUnits
            ? getPricePerKg(item)
            : item.unitPrice,
          unitQuantity: item.tracksStockUnits
            ? (state?.unitQuantity ?? 0)
            : undefined,
          itemCondition: state?.itemCondition ?? "GOOD",
        };
      })
      .filter((item) => item.quantity > 0);

    setIsSubmitting(true);
    try {
      const result = await createReturnCreditNoteAction({
        orgSlug,
        saleId: salesOrderId,
        reason: returnReason.trim(),
        notes: returnNotes.trim() || null,
        items,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Devolución registrada · NC ${result.data.creditNoteNumber} creada`
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

  async function handleSubmit() {
    if (mode === "return") {
      await handleReturnSubmit();
      return;
    }

    await handleManualCreditNoteSubmit();
  }

  async function handleCreatedCreditNoteSuccess(result: {
    creditNoteNumber: string;
    creditNoteId: string;
    accountingPayload?: typeof accountingPayload;
  }) {
    toast.success(
      `Nota de crédito ${result.creditNoteNumber} creada correctamente`
    );
    await queryClient.invalidateQueries({
      queryKey: creditNotesQueryKey(orgSlug),
    });

    if (result.accountingPayload) {
      toast.success(
        `Nota de crédito ${result.creditNoteNumber} creada. Revisá el asiento contable.`
      );
      setOpen(false);
      reset();
      setAccountingPayload(result.accountingPayload);
      setAccountingCreditNoteId(result.creditNoteId);
      return;
    }

    router.refresh();
    setOpen(false);
    reset();
  }

  async function handleManualCreditNoteSubmit() {
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
        applyToReceivable: shouldApplyToReceivable,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      await handleCreatedCreditNoteSuccess(result);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {accountingPayload ? (
        <AsientoModal
          eventoPayload={accountingPayload}
          mode="gate"
          onCancel={() => {
            setAccountingPayload(null);
            setAccountingCreditNoteId(null);
            router.refresh();
          }}
          onConfirm={async (journalEntryId) => {
            if (accountingCreditNoteId) {
              await markCreditNoteAccountingJournalAction({
                orgSlug,
                creditNoteId: accountingCreditNoteId,
                journalEntryId,
              });
            }
            setAccountingPayload(null);
            setAccountingCreditNoteId(null);
            toast.success("Asiento contable registrado correctamente.");
            router.refresh();
          }}
          open
          persistAs="formal"
        />
      ) : null}

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
        <DialogContent
          className={mode === "return" ? "sm:max-w-4xl" : "sm:max-w-lg"}
        >
          <DialogHeader>
            <DialogTitle>Nueva nota de crédito</DialogTitle>
            <DialogDescription>{resolvedDialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 rounded-lg border p-1">
              <button
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
                  mode === "sale"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setMode("sale");
                  setCustomerId("");
                  setSupplierId("");
                  setReturnSale(null);
                  setReturnedQuantities({});
                  setReturnedUnitQuantities({});
                  setExistingReturnCreditNoteTotal(0);
                  setReturnItemStates({});
                }}
                type="button"
              >
                Con venta
              </button>
              <button
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
                  mode === "return"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setMode("return");
                  setCustomerId("");
                  setSupplierId("");
                  setAmount("");
                  setObservations("");
                }}
                type="button"
              >
                Por devolución
              </button>
              <button
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
                  mode === "direct"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setMode("direct");
                  setSalesOrderId("");
                  setReturnSale(null);
                  setReturnedQuantities({});
                  setReturnedUnitQuantities({});
                  setExistingReturnCreditNoteTotal(0);
                  setReturnItemStates({});
                }}
                type="button"
              >
                Sin venta
              </button>
            </div>

            {mode === "sale" && (
              <div className="space-y-1.5">
                <Label htmlFor="nc-sale">Venta *</Label>
                <SalePicker
                  eligibleSales={eligibleSales}
                  isOpen={isSalePickerOpen}
                  salesOrderId={salesOrderId}
                  search={saleSearch}
                  setIsOpen={setIsSalePickerOpen}
                  setSalesOrderId={handleManualSaleSelection}
                  setSearch={setSaleSearch}
                />
              </div>
            )}

            {mode === "direct" && (
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

            {mode === "return" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nc-return-sale">Venta *</Label>
                  <SalePicker
                    eligibleSales={returnEligibleSales}
                    isOpen={isSalePickerOpen}
                    salesOrderId={salesOrderId}
                    search={saleSearch}
                    setIsOpen={setIsSalePickerOpen}
                    setSalesOrderId={(id) => {
                      setSalesOrderId(id);
                      setReturnSale(null);
                      setReturnedQuantities({});
                      setReturnedUnitQuantities({});
                      setExistingReturnCreditNoteTotal(0);
                      setReturnItemStates({});
                    }}
                    setSearch={setSaleSearch}
                  />
                </div>

                {isLoadingReturnSale && (
                  <p className="text-muted-foreground text-sm">
                    Cargando productos...
                  </p>
                )}

                {returnSale && !isLoadingReturnSale && (
                  <div className="rounded-md border px-4">
                    {returnableItems.length > 0 ? (
                      returnableItems.map((item) => {
                        const state = returnItemStates[item.id];
                        if (!state) {
                          return null;
                        }

                        return (
                          <ReturnItemRow
                            item={item}
                            key={item.id}
                            lineTotal={calculateReturnLineTotal({
                              item,
                              sale: returnSale,
                              returnQuantity: state.returnQuantity,
                            })}
                            onConditionChange={handleReturnConditionChange}
                            onQuantityChange={handleReturnQuantityChange}
                            onUnitsChange={handleReturnUnitsChange}
                            onWeightChange={handleReturnWeightChange}
                            remainingQty={getRemainingReturnQuantity(
                              item,
                              returnedQuantities
                            )}
                            remainingUnits={getRemainingReturnUnits(
                              item,
                              returnedUnitQuantities
                            )}
                            state={state}
                          />
                        );
                      })
                    ) : (
                      <p className="py-4 text-muted-foreground text-sm">
                        {existingReturnCreditNoteTotal > 0
                          ? `La venta seleccionada no tiene productos disponibles para devolver. Ya existe una nota de crédito por ${formatCurrency(existingReturnCreditNoteTotal)}.`
                          : "La venta seleccionada no tiene productos disponibles para devolver."}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-return-reason">Motivo *</Label>
                    <Input
                      id="nc-return-reason"
                      onChange={(event) => setReturnReason(event.target.value)}
                      placeholder="Ej: producto vencido, error en pedido..."
                      value={returnReason}
                    />
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <p className="text-muted-foreground text-xs">
                      Total NC c/imp.
                    </p>
                    <p className="font-semibold text-lg">
                      {formatCurrency(returnTotal)}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nc-return-notes">
                    Observaciones{" "}
                    <span className="font-normal text-muted-foreground">
                      (opcional)
                    </span>
                  </Label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    id="nc-return-notes"
                    onChange={(event) => setReturnNotes(event.target.value)}
                    placeholder="Observaciones internas..."
                    rows={3}
                    value={returnNotes}
                  />
                </div>
              </div>
            )}

            {mode !== "return" && (
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
            )}

            {mode === "sale" && selectedSale && (
              <div className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="nc-apply-to-receivable">
                        Cancelar automáticamente la factura asociada
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            aria-label="Cómo funciona la cancelación automática"
                            className="text-muted-foreground hover:text-foreground"
                            type="button"
                          >
                            <Info className="size-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs" side="top">
                          Al activarlo, la NC se aplica a la cuenta corriente de
                          esta factura hasta su saldo pendiente. Si sobra
                          importe, queda como saldo a favor. Al desactivarlo, la
                          factura no se modifica y toda la NC queda como saldo a
                          favor.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {canApplyToReceivable
                        ? `Saldo pendiente: ${formatCurrency(selectedSalePendingBalance)}`
                        : "La factura no tiene saldo pendiente; la NC quedará como saldo a favor."}
                    </p>
                  </div>
                  <Switch
                    checked={applyToReceivable}
                    disabled={!canApplyToReceivable}
                    id="nc-apply-to-receivable"
                    onCheckedChange={setApplyToReceivable}
                  />
                </div>
              </div>
            )}

            {mode !== "return" && (
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
            )}
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
            <Button
              disabled={
                isSubmitting || (mode === "return" && isLoadingReturnSale)
              }
              onClick={handleSubmit}
              type="button"
            >
              {isSubmitting ? "Creando..." : submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
