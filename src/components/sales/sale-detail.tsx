"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarIcon,
  Check,
  ChevronsUpDown,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Customer } from "@/modules/customers/types";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";
import { useConfirmSaleMutation } from "@/modules/sales/hooks/use-confirm-sale-mutation";
import { useDeliverSaleMutation } from "@/modules/sales/hooks/use-deliver-sale-mutation";
import { useDispatchSaleMutation } from "@/modules/sales/hooks/use-dispatch-sale-mutation";
import type { SalesOrderDetail } from "@/modules/sales/service/sales.service";
import type { InvoiceType, SaleProduct } from "@/modules/sales/types";
import {
  addDays,
  computeDueDate,
  toDateOnlyString,
} from "@/modules/sales/utils/date";
import type { Tax } from "@/modules/taxes/service/taxes.service";

const invoiceTypeOptions: { value: InvoiceType; label: string }[] = [
  { value: "NOTA_DE_VENTA", label: "Nota de venta" },
  { value: "FACTURA_A", label: "Factura A" },
  { value: "FACTURA_B", label: "Factura B" },
  { value: "FACTURA_C", label: "Factura C" },
];

const textareaBaseClasses =
  "min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

const unitOfMeasureLabels: Record<
  SalesOrderDetail["items"][number]["unitOfMeasure"],
  string
> = {
  UN: "unidad",
  KG: "kg",
  LT: "lt",
  MT: "m",
};

const statusLabels: Record<
  SalesOrderDetail["status"],
  { label: string; badgeClass: string }
> = {
  DRAFT: { label: "Preventa", badgeClass: "border-amber-200 bg-amber-50" },
  CONFIRMED: { label: "Confirmada", badgeClass: "border-blue-200 bg-blue-50" },
  DISPATCH: {
    label: "Despachada",
    badgeClass: "border-orange-200 bg-orange-50 text-neutral-900",
  },
  DELIVERED: {
    label: "Entregada",
    badgeClass: "border-emerald-200 bg-emerald-50",
  },
  CANCELLED: { label: "Cancelada", badgeClass: "border-red-200 bg-red-50" },
};

type ItemState = SalesOrderDetail["items"][number];

type SaleDetailProps = {
  orgSlug: string;
  sale: SalesOrderDetail;
  customers: Customer[];
  sellers: OrganizationMember[];
  taxes: Tax[];
  products: SaleProduct[];
};

const isWeightOrVolumeUnit = (
  unit: ItemState["unitOfMeasure"]
): unit is "KG" | "LT" => unit === "KG" || unit === "LT";

function buildSellerLabel(member: OrganizationMember): string {
  if (member.user?.name) {
    return member.user.name;
  }

  if (member.user?.email) {
    return member.user.email;
  }

  return "Usuario sin nombre";
}

const formatAveragePerUnit = (
  average: number | null,
  unitOfMeasure: ItemState["unitOfMeasure"]
): string | null => {
  if (!average || average <= 0) {
    return null;
  }

  return `${average.toFixed(2)} ${unitOfMeasureLabels[unitOfMeasure]}/u`;
};

const formatPriceByMeasure = (
  price: number,
  unitOfMeasure: ItemState["unitOfMeasure"]
): string => `${formatCurrency(price)} x ${unitOfMeasureLabels[unitOfMeasure]}`;

const resolveAppliedUnitPrice = (product: SaleProduct): number => {
  const average = product.averageQuantityPerUnit;
  const shouldUseAverage =
    product.tracksStockUnits &&
    isWeightOrVolumeUnit(product.unitOfMeasure) &&
    average !== null &&
    average > 0;

  if (shouldUseAverage) {
    return product.price * average;
  }

  return product.price;
};

function mapItemToState(item: ItemState): ItemState {
  let estimatedWeight: number | null = null;

  if (item.weightQuantity !== null && item.weightQuantity !== undefined) {
    estimatedWeight = item.weightQuantity;
  } else if (
    isWeightOrVolumeUnit(item.unitOfMeasure) &&
    item.averageQuantityPerUnit &&
    item.averageQuantityPerUnit > 0
  ) {
    estimatedWeight = item.quantity * item.averageQuantityPerUnit;
  }

  return {
    ...item,
    weightQuantity: estimatedWeight,
  };
}

function calculateItemTotals(item: ItemState) {
  const usesWeight =
    isWeightOrVolumeUnit(item.unitOfMeasure) &&
    item.weightQuantity !== null &&
    item.weightQuantity > 0;

  const effectiveQuantity = usesWeight
    ? (item.weightQuantity ?? 0)
    : item.quantity;
  const effectiveUnitPrice = usesWeight ? item.basePrice : item.unitPrice;
  const gross = effectiveQuantity * effectiveUnitPrice;
  const discount = Math.min(
    Math.max(0, (item.discountPercent / 100) * gross),
    Math.max(0, gross)
  );
  const subtotal = Math.max(0, gross - discount);

  return { gross, discount, subtotal };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI form composition requires several guarded states
export function SaleDetail({
  orgSlug,
  sale,
  customers,
  sellers,
  taxes,
  products,
}: SaleDetailProps) {
  const router = useRouter();
  const { confirmSale } = useConfirmSaleMutation();
  const { dispatchSale } = useDispatchSaleMutation();
  const { deliverSale } = useDeliverSaleMutation();
  const isDraftSale = sale.status === "DRAFT";
  const isConfirmedSale = sale.status === "CONFIRMED";
  const isDispatchedSale = sale.status === "DISPATCH";

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [isSellerPickerOpen, setIsSellerPickerOpen] = useState(false);
  const [isTaxesPickerOpen, setIsTaxesPickerOpen] = useState(false);
  const [customerId, setCustomerId] = useState<string>(
    sale.customer?.id ?? sale.customer_id
  );
  const [sellerId, setSellerId] = useState<string>(sale.user_id ?? "");
  const [saleDate, setSaleDate] = useState<Date>(new Date(sale.sale_date));
  const [expirationDays, setExpirationDays] = useState<number | null>(() => {
    if (sale.expiration_date) {
      const today = new Date();
      const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const expiration = new Date(sale.expiration_date);
      const startOfExpiration = new Date(
        expiration.getFullYear(),
        expiration.getMonth(),
        expiration.getDate()
      );
      const diffMs = startOfExpiration.getTime() - startOfToday.getTime();
      const parsedDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      return parsedDays;
    }

    if (
      typeof sale.credit_days === "number" &&
      !Number.isNaN(sale.credit_days)
    ) {
      return sale.credit_days;
    }

    return null;
  });
  const [invoiceType, setInvoiceType] = useState<InvoiceType>(
    sale.invoice_type ?? "NOTA_DE_VENTA"
  );
  const [observations, setObservations] = useState<string>(
    sale.observations ?? ""
  );
  const [invoiceNumber, setInvoiceNumber] = useState<string>(
    sale.invoice_number ?? ""
  );
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState<number>(
    sale.global_discount_percentage ?? 0
  );
  const [selectedTaxIds, setSelectedTaxIds] = useState<string[]>(
    (sale.taxes ?? []).map((tax) => tax.taxId)
  );
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [isSupplierFilterOpen, setIsSupplierFilterOpen] = useState(false);
  const [isBrandFilterOpen, setIsBrandFilterOpen] = useState(false);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false);
  const [remittanceNumber, setRemittanceNumber] = useState<string>(
    sale.remittance_number ?? ""
  );
  const [isDelivering, setIsDelivering] = useState(false);
  const [items, setItems] = useState<ItemState[]>(() =>
    sale.items.map(mapItemToState)
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const saleDateString = useMemo(() => toDateOnlyString(saleDate), [saleDate]);
  const expirationDateString = useMemo(() => {
    if (typeof expirationDays === "number" && !Number.isNaN(expirationDays)) {
      const today = toDateOnlyString(new Date());
      return addDays(today, expirationDays);
    }

    if (sale.expiration_date) {
      return toDateOnlyString(new Date(sale.expiration_date));
    }

    return null;
  }, [expirationDays, sale.expiration_date]);
  const normalizedExpirationDays =
    typeof expirationDays === "number" && !Number.isNaN(expirationDays)
      ? expirationDays
      : null;

  const availableTaxes = useMemo(() => {
    const byId = new Map<string, Tax>();
    for (const tax of taxes) {
      byId.set(tax.id, tax);
    }

    for (const applied of sale.taxes) {
      if (applied.taxId && !byId.has(applied.taxId)) {
        byId.set(applied.taxId, {
          id: applied.taxId,
          name: applied.name,
          rate: applied.rate,
          code: null,
          description: null,
          created_at: null,
          updated_at: null,
          is_active: false,
        });
      }
    }

    return Array.from(byId.values());
  }, [sale.taxes, taxes]);

  const selectedTaxes = useMemo(
    () => availableTaxes.filter((tax) => selectedTaxIds.includes(tax.id)),
    [availableTaxes, selectedTaxIds]
  );

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const supplierOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const product of products) {
      if (product.supplierId && product.supplierName) {
        options.set(product.supplierId, product.supplierName);
      }
    }

    return Array.from(options.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const categoryOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const product of products) {
      if (product.categoryId && product.categoryName) {
        options.set(product.categoryId, product.categoryName);
      }
    }

    return Array.from(options.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();

    for (const product of products) {
      const brand = product.brand?.trim();
      if (brand) {
        brands.add(brand);
      }
    }

    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const normalizedBrand = product.brand?.trim() ?? "";

        if (supplierFilter && product.supplierId !== supplierFilter) {
          return false;
        }

        if (brandFilter && normalizedBrand !== brandFilter) {
          return false;
        }

        if (categoryFilter && product.categoryId !== categoryFilter) {
          return false;
        }

        return true;
      }),
    [brandFilter, categoryFilter, products, supplierFilter]
  );

  const supplierFilterLabel = useMemo(() => {
    if (!supplierFilter) {
      return "Todos";
    }
    return supplierOptions.find((option) => option.id === supplierFilter)
      ?.label;
  }, [supplierFilter, supplierOptions]);

  const brandFilterLabel = useMemo(() => {
    if (!brandFilter) {
      return "Todas";
    }
    return brandOptions.find((brand) => brand === brandFilter) ?? "Todas";
  }, [brandFilter, brandOptions]);

  const categoryFilterLabel = useMemo(() => {
    if (!categoryFilter) {
      return "Todas";
    }
    return categoryOptions.find((option) => option.id === categoryFilter)
      ?.label;
  }, [categoryFilter, categoryOptions]);

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );
  const selectedSeller = sellers.find((seller) => seller.user_id === sellerId);

  const totals = useMemo(() => {
    const aggregated = items.reduce(
      (acc, item) => {
        const { discount, subtotal } = calculateItemTotals(item);
        const weight = (() => {
          if (!isWeightOrVolumeUnit(item.unitOfMeasure)) {
            return 0;
          }
          if (item.weightQuantity && item.weightQuantity > 0) {
            return item.weightQuantity;
          }
          if (item.averageQuantityPerUnit && item.averageQuantityPerUnit > 0) {
            return item.averageQuantityPerUnit * item.quantity;
          }
          return 0;
        })();

        return {
          subtotal: acc.subtotal + subtotal,
          totalUnits: acc.totalUnits + item.quantity,
          totalWeight: acc.totalWeight + weight,
          lineDiscountAmount: acc.lineDiscountAmount + discount,
        };
      },
      {
        subtotal: 0,
        totalUnits: 0,
        totalWeight: 0,
        lineDiscountAmount: 0,
      }
    );

    const taxDetails = selectedTaxes.map((tax) => ({
      tax,
      amount: aggregated.subtotal * (tax.rate / 100),
    }));

    const totalTaxAmount = taxDetails.reduce(
      (sum, detail) => sum + detail.amount,
      0
    );
    const preDiscountTotal = aggregated.subtotal + totalTaxAmount;
    const globalDiscountAmount = Math.min(
      Math.max(0, (globalDiscountPercent / 100) * preDiscountTotal),
      Math.max(0, preDiscountTotal)
    );
    const total = Math.max(0, preDiscountTotal - globalDiscountAmount);
    const totalDiscountAmount =
      aggregated.lineDiscountAmount + globalDiscountAmount;

    return {
      subtotal: aggregated.subtotal,
      totalUnits: aggregated.totalUnits,
      totalWeight: aggregated.totalWeight,
      taxDetails,
      totalTaxAmount,
      preDiscountTotal,
      lineDiscountAmount: aggregated.lineDiscountAmount,
      globalDiscountAmount,
      totalDiscountAmount,
      total,
    };
  }, [globalDiscountPercent, items, selectedTaxes]);

  const dueDate = computeDueDate(
    saleDateString,
    expirationDateString,
    normalizedExpirationDays ?? sale.credit_days
  );

  const weightUnitLabel = useMemo(() => {
    const weightItem = items.find((item) =>
      isWeightOrVolumeUnit(item.unitOfMeasure)
    );
    return weightItem
      ? unitOfMeasureLabels[weightItem.unitOfMeasure]
      : unitOfMeasureLabels.KG;
  }, [items]);

  const handleQuantityChange = (id: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const quantity = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity,
            }
          : item
      )
    );
  };

  const handleWeightChange = (id: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const weight = Number.isNaN(parsed) ? null : Math.max(0, parsed);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              weightQuantity: weight,
            }
          : item
      )
    );
  };

  const handleDiscountChange = (id: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const discount = Number.isNaN(parsed)
      ? 0
      : Math.min(Math.max(0, parsed), 100);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              discountPercent: discount,
            }
          : item
      )
    );
  };

  const handleUnitPriceChange = (id: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const unitPrice = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              unitPrice,
            }
          : item
      )
    );
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleToggleTax = (taxId: string) => {
    setSelectedTaxIds((prev) =>
      prev.includes(taxId)
        ? prev.filter((id) => id !== taxId)
        : [...prev, taxId]
    );
  };

  const handleAddProduct = () => {
    if (!selectedProductId) {
      setError("Selecciona un producto para agregarlo");
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);

    if (!product) {
      setError("Producto no encontrado");
      return;
    }

    if (!selectedQuantity || selectedQuantity <= 0) {
      setError("La cantidad debe ser mayor a 0");
      return;
    }

    const appliedUnitPrice = resolveAppliedUnitPrice(product);
    const weightEstimate =
      product.tracksStockUnits &&
      isWeightOrVolumeUnit(product.unitOfMeasure) &&
      product.averageQuantityPerUnit
        ? product.averageQuantityPerUnit * selectedQuantity
        : null;

    setItems((prev) => {
      const exists = prev.find((item) => item.productId === product.id);

      if (exists) {
        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + selectedQuantity,
                unitPrice: appliedUnitPrice,
                basePrice: product.price,
                averageQuantityPerUnit: product.averageQuantityPerUnit,
                weightQuantity: item.weightQuantity ?? weightEstimate,
                unitOfMeasure: product.unitOfMeasure,
                tracksStockUnits: product.tracksStockUnits,
              }
            : item
        );
      }

      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          sku: product.sku,
          brand: product.brand,
          quantity: selectedQuantity,
          weightQuantity: weightEstimate,
          unitPrice: appliedUnitPrice,
          basePrice: product.price,
          discountPercent: 0,
          subtotal: 0,
          unitOfMeasure: product.unitOfMeasure,
          tracksStockUnits: product.tracksStockUnits,
          averageQuantityPerUnit: product.averageQuantityPerUnit,
        },
      ];
    });

    setSelectedProductId("");
    setSelectedQuantity(1);
    setError(null);
  };

  const canConfirm =
    isDraftSale && Boolean(customerId) && Boolean(sellerId) && items.length > 0;
  const isSaving = confirmSale.isPending;
  const isDispatching = dispatchSale.isPending;
  const isDeliverMutationPending = deliverSale.isPending || isDelivering;

  const handleConfirm = async () => {
    if (!canConfirm) {
      setError("Completa los datos requeridos antes de confirmar la venta.");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await confirmSale.mutateAsync({
        orgSlug,
        saleId: sale.id,
        customerId,
        sellerId,
        saleDate: saleDateString,
        expirationDate: expirationDateString ?? null,
        creditDays:
          normalizedExpirationDays !== null && normalizedExpirationDays >= 0
            ? normalizedExpirationDays
            : (sale.credit_days ?? null),
        invoiceType,
        invoiceNumber: invoiceNumber || null,
        observations: observations || null,
        globalDiscountPercentage: Math.min(
          Math.max(0, globalDiscountPercent),
          100
        ),
        items: items.map((item) => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          weightQuantity: item.weightQuantity ?? null,
          unitPrice: item.unitPrice,
          basePrice: item.basePrice,
          discountPercentage: item.discountPercent,
        })),
        taxes: selectedTaxes.map((tax) => ({
          taxId: tax.id,
          name: tax.name,
          rate: tax.rate,
        })),
      });

      setSuccessMessage("Venta confirmada correctamente.");
      router.push(`/org/${orgSlug}/ventas?estado=CONFIRMED`);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo confirmar la venta, intenta nuevamente."
      );
    }
  };

  const handleDispatch = async () => {
    if (!remittanceNumber.trim()) {
      setError("Ingresa el número de remito para despachar la venta.");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await dispatchSale.mutateAsync({
        orgSlug,
        saleId: sale.id,
        remittanceNumber: remittanceNumber.trim(),
      });
      setIsDispatchDialogOpen(false);
      setSuccessMessage("Venta despachada correctamente.");
      router.push(`/org/${orgSlug}/ventas?estado=DISPATCH`);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo despachar la venta, intenta nuevamente."
      );
    }
  };

  const handleDeliver = async () => {
    setError(null);
    setSuccessMessage(null);
    setIsDelivering(true);

    try {
      await deliverSale.mutateAsync({
        orgSlug,
        saleId: sale.id,
      });
      setSuccessMessage("Venta marcada como entregada.");
      router.push(`/org/${orgSlug}/ventas?estado=DELIVERED`);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo marcar como entregada, intenta nuevamente."
      );
    } finally {
      setIsDelivering(false);
    }
  };

  const statusInfo = statusLabels[sale.status];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/org/${orgSlug}/ventas`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a ventas
          </Button>
        </Link>

        <Badge className={cn("border px-3 py-1", statusInfo.badgeClass)}>
          {statusInfo.label}
        </Badge>

        <div className="ml-auto flex gap-2">
          {isDispatchedSale ? (
            <Button
              disabled={isDeliverMutationPending}
              onClick={handleDeliver}
              size="sm"
              type="button"
              variant="outline"
            >
              {isDeliverMutationPending
                ? "Marcando..."
                : "Marcar como entregada"}
            </Button>
          ) : null}
          {isConfirmedSale ? (
            <Button
              disabled={isDispatching}
              onClick={() => setIsDispatchDialogOpen(true)}
              size="sm"
              type="button"
            >
              <Truck className="mr-2 h-4 w-4" />
              {isDispatching ? "Despachando..." : "Despachar"}
            </Button>
          ) : null}
          <Button
            onClick={() => setIsEditingDetails((prev) => !prev)}
            size="sm"
            type="button"
            variant={isEditingDetails ? "secondary" : "outline"}
          >
            {isEditingDetails ? (
              <>
                <Lock className="mr-2 h-4 w-4" />
                Bloquear campos
              </>
            ) : (
              <>
                <Pencil className="mr-2 h-4 w-4" />
                Editar venta
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl">
          Venta #
          {sale.sale_number ?? sale.invoice_number ?? sale.id.slice(0, 6)}
        </h1>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="customer">Cliente</Label>
                  <Popover
                    onOpenChange={setIsCustomerPickerOpen}
                    open={isCustomerPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isCustomerPickerOpen}
                        className="w-full justify-between text-left font-normal"
                        disabled={!isEditingDetails}
                        id="customer"
                        role="combobox"
                        variant="outline"
                      >
                        <span className="truncate">
                          {selectedCustomer
                            ? selectedCustomer.fantasy_name ||
                              selectedCustomer.business_name
                            : "Selecciona un cliente"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[320px] max-w-[90vw] p-0"
                      sideOffset={8}
                    >
                      <Command>
                        <CommandInput placeholder="Buscar cliente..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {customers.map((customer) => {
                              const label =
                                customer.fantasy_name ||
                                customer.business_name ||
                                "Cliente sin nombre";
                              return (
                                <CommandItem
                                  key={customer.id}
                                  onSelect={() => {
                                    setCustomerId(customer.id);
                                    setIsCustomerPickerOpen(false);
                                  }}
                                  value={label}
                                >
                                  <span className="flex-1 truncate">
                                    {label}
                                  </span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      customerId === customer.id
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
                  <p className="text-muted-foreground text-xs">
                    Cliente asignado a la venta.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seller">Vendedor</Label>
                  <Popover
                    onOpenChange={setIsSellerPickerOpen}
                    open={isSellerPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isSellerPickerOpen}
                        className="w-full justify-between text-left font-normal"
                        disabled={!isEditingDetails}
                        id="seller"
                        role="combobox"
                        variant="outline"
                      >
                        <span className="truncate">
                          {selectedSeller
                            ? buildSellerLabel(selectedSeller)
                            : "Selecciona un vendedor"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[320px] max-w-[90vw] p-0"
                      sideOffset={8}
                    >
                      <Command>
                        <CommandInput placeholder="Buscar vendedor..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {sellers
                              .filter((member) => Boolean(member.user_id))
                              .map((seller) => (
                                <CommandItem
                                  key={seller.user_id}
                                  onSelect={() => {
                                    setSellerId(seller.user_id);
                                    setIsSellerPickerOpen(false);
                                  }}
                                  value={buildSellerLabel(seller)}
                                >
                                  <span className="flex-1 truncate">
                                    {buildSellerLabel(seller)}
                                  </span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      sellerId === seller.user_id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-muted-foreground text-xs">
                    Usamos los usuarios de la organización como vendedores.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="saleDate">Fecha de venta</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !saleDate && "text-muted-foreground"
                        )}
                        disabled={!isEditingDetails}
                        id="saleDate"
                        variant="outline"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {saleDate ? (
                          format(saleDate, "PPP", { locale: es })
                        ) : (
                          <span>Seleccione una fecha</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        initialFocus
                        locale={es}
                        mode="single"
                        onSelect={(date) => setSaleDate(date ?? new Date())}
                        selected={saleDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expirationDays">Fecha de vencimiento</Label>
                  <Input
                    disabled={!isEditingDetails}
                    id="expirationDays"
                    inputMode="numeric"
                    min={0}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      setExpirationDays(
                        Number.isNaN(parsed) ? null : Math.max(0, parsed)
                      );
                    }}
                    placeholder="Días hasta el vencimiento"
                    step="1"
                    type="number"
                    value={normalizedExpirationDays ?? ""}
                  />
                  <p className="text-muted-foreground text-xs">
                    {expirationDateString ? (
                      <>
                        Vence el {formatDateOnly(expirationDateString)}
                        {normalizedExpirationDays !== null
                          ? ` (hoy + ${normalizedExpirationDays} días)`
                          : ""}
                        .
                      </>
                    ) : (
                      "Si lo dejas vacío, usamos la fecha de venta."
                    )}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invoiceType">Tipo de comprobante</Label>
                  <Select
                    disabled={!isEditingDetails}
                    onValueChange={(value) =>
                      setInvoiceType(value as InvoiceType)
                    }
                    value={invoiceType}
                  >
                    <SelectTrigger className="w-full" id="invoiceType">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {invoiceTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taxes">Impuestos</Label>
                  <Popover
                    onOpenChange={setIsTaxesPickerOpen}
                    open={isTaxesPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isTaxesPickerOpen}
                        className="h-auto min-h-9 w-full justify-between text-left font-normal"
                        disabled={!isEditingDetails}
                        id="taxes"
                        role="combobox"
                        variant="outline"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 pr-2.5">
                          {selectedTaxes.length > 0 ? (
                            selectedTaxes.map((tax) => (
                              <Badge
                                className="rounded-sm"
                                key={tax.id}
                                variant="outline"
                              >
                                {tax.name} ({tax.rate}%)
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">
                              Seleccione impuestos (opcional)
                            </span>
                          )}
                        </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                          <CommandEmpty>
                            No se encontraron impuestos.
                          </CommandEmpty>
                          <CommandGroup>
                            {availableTaxes.map((tax) => (
                              <CommandItem
                                key={tax.id}
                                onSelect={() => handleToggleTax(tax.id)}
                                value={tax.name}
                              >
                                <span className="flex-1 truncate">
                                  {tax.name} ({tax.rate}%)
                                </span>
                                {selectedTaxIds.includes(tax.id) ? (
                                  <Check className="h-4 w-4 shrink-0 text-primary" />
                                ) : null}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-muted-foreground text-xs">
                    Selecciona los impuestos aplicados a esta venta.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invoiceNumber">Número de comprobante</Label>
                  <Input
                    disabled={!isEditingDetails}
                    id="invoiceNumber"
                    onChange={(event) =>
                      setInvoiceNumber(event.target.value.slice(0, 50))
                    }
                    placeholder="Opcional"
                    value={invoiceNumber ?? ""}
                  />
                </div>
                {sale.remittance_number ? (
                  <div className="space-y-2">
                    <Label htmlFor="remittanceNumberDisplay">
                      Número de remito
                    </Label>
                    <Input
                      disabled={!isEditingDetails}
                      id="remittanceNumberDisplay"
                      onChange={(event) =>
                        setRemittanceNumber(event.target.value.slice(0, 100))
                      }
                      value={remittanceNumber}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="observations">Observaciones</Label>
                  <textarea
                    className={textareaBaseClasses}
                    disabled={!isEditingDetails}
                    id="observations"
                    onChange={(event) => setObservations(event.target.value)}
                    placeholder="Notas internas o comentarios del cliente"
                    value={observations ?? ""}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Productos de la venta</CardTitle>
              <CardDescription>
                Solo puedes ajustar cantidades y peso para los productos por
                kilo/litro. En modo edición también puedes agregar productos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditingDetails ? (
                <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="supplierFilter">Proveedor</Label>
                      <Popover
                        onOpenChange={setIsSupplierFilterOpen}
                        open={isSupplierFilterOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            aria-expanded={isSupplierFilterOpen}
                            className="w-full justify-between text-left font-normal"
                            id="supplierFilter"
                            role="combobox"
                            variant="outline"
                          >
                            <span className="truncate">
                              {supplierFilterLabel || "Todos"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[280px] max-w-[90vw] p-0"
                          sideOffset={8}
                        >
                          <Command>
                            <CommandInput placeholder="Buscar proveedor..." />
                            <CommandList>
                              <CommandEmpty>Sin resultados.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  key="all"
                                  onSelect={() => {
                                    setSupplierFilter("");
                                    setIsSupplierFilterOpen(false);
                                  }}
                                  value="Todos"
                                >
                                  <span className="flex-1 truncate">Todos</span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      supplierFilter
                                        ? "opacity-0"
                                        : "opacity-100"
                                    )}
                                  />
                                </CommandItem>
                                {supplierOptions.map((supplier) => (
                                  <CommandItem
                                    key={supplier.id}
                                    onSelect={() => {
                                      setSupplierFilter(supplier.id);
                                      setIsSupplierFilterOpen(false);
                                    }}
                                    value={supplier.label}
                                  >
                                    <span className="flex-1 truncate">
                                      {supplier.label}
                                    </span>
                                    <Check
                                      className={cn(
                                        "h-4 w-4 shrink-0 text-primary transition-opacity",
                                        supplierFilter === supplier.id
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="brandFilter">Marca</Label>
                      <Popover
                        onOpenChange={setIsBrandFilterOpen}
                        open={isBrandFilterOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            aria-expanded={isBrandFilterOpen}
                            className="w-full justify-between text-left font-normal"
                            id="brandFilter"
                            role="combobox"
                            variant="outline"
                          >
                            <span className="truncate">
                              {brandFilterLabel || "Todas"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[280px] max-w-[90vw] p-0"
                          sideOffset={8}
                        >
                          <Command>
                            <CommandInput placeholder="Buscar marca..." />
                            <CommandList>
                              <CommandEmpty>Sin resultados.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  key="all"
                                  onSelect={() => {
                                    setBrandFilter("");
                                    setIsBrandFilterOpen(false);
                                  }}
                                  value="Todas"
                                >
                                  <span className="flex-1 truncate">Todas</span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      brandFilter ? "opacity-0" : "opacity-100"
                                    )}
                                  />
                                </CommandItem>
                                {brandOptions.map((brand) => (
                                  <CommandItem
                                    key={brand}
                                    onSelect={() => {
                                      setBrandFilter(brand);
                                      setIsBrandFilterOpen(false);
                                    }}
                                    value={brand}
                                  >
                                    <span className="flex-1 truncate">
                                      {brand}
                                    </span>
                                    <Check
                                      className={cn(
                                        "h-4 w-4 shrink-0 text-primary transition-opacity",
                                        brandFilter === brand
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="categoryFilter">Categoría</Label>
                      <Popover
                        onOpenChange={setIsCategoryFilterOpen}
                        open={isCategoryFilterOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            aria-expanded={isCategoryFilterOpen}
                            className="w-full justify-between text-left font-normal"
                            id="categoryFilter"
                            role="combobox"
                            variant="outline"
                          >
                            <span className="truncate">
                              {categoryFilterLabel || "Todas"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[280px] max-w-[90vw] p-0"
                          sideOffset={8}
                        >
                          <Command>
                            <CommandInput placeholder="Buscar categoría..." />
                            <CommandList>
                              <CommandEmpty>Sin resultados.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  key="all"
                                  onSelect={() => {
                                    setCategoryFilter("");
                                    setIsCategoryFilterOpen(false);
                                  }}
                                  value="Todas"
                                >
                                  <span className="flex-1 truncate">Todas</span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      categoryFilter
                                        ? "opacity-0"
                                        : "opacity-100"
                                    )}
                                  />
                                </CommandItem>
                                {categoryOptions.map((category) => (
                                  <CommandItem
                                    key={category.id}
                                    onSelect={() => {
                                      setCategoryFilter(category.id);
                                      setIsCategoryFilterOpen(false);
                                    }}
                                    value={category.label}
                                  >
                                    <span className="flex-1 truncate">
                                      {category.label}
                                    </span>
                                    <Check
                                      className={cn(
                                        "h-4 w-4 shrink-0 text-primary transition-opacity",
                                        categoryFilter === category.id
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,_2fr)_140px_auto] md:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor="product">Producto</Label>
                      <Popover
                        onOpenChange={setIsProductPickerOpen}
                        open={isProductPickerOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            aria-expanded={isProductPickerOpen}
                            className="w-full justify-between text-left font-normal"
                            id="product"
                            role="combobox"
                            variant="outline"
                          >
                            {selectedProduct ? (
                              <div className="flex flex-1 flex-col text-left leading-tight">
                                <span className="truncate font-medium">
                                  {selectedProduct.name}
                                </span>
                                <span className="truncate text-muted-foreground text-xs">
                                  {selectedProduct.sku} ·{" "}
                                  {formatPriceByMeasure(
                                    selectedProduct.price,
                                    selectedProduct.unitOfMeasure
                                  )}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">
                                Selecciona un producto
                              </span>
                            )}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[520px] max-w-[90vw] p-0"
                          sideOffset={8}
                        >
                          <Command>
                            <CommandInput placeholder="Buscar producto por nombre o SKU..." />
                            <CommandList>
                              <CommandEmpty>
                                No se encontraron productos para los filtros
                                aplicados.
                              </CommandEmpty>
                              <CommandGroup>
                                {filteredProducts.map((product) => {
                                  const averageLabel =
                                    product.tracksStockUnits &&
                                    isWeightOrVolumeUnit(product.unitOfMeasure)
                                      ? formatAveragePerUnit(
                                          product.averageQuantityPerUnit,
                                          product.unitOfMeasure
                                        )
                                      : null;
                                  const appliedPrice =
                                    resolveAppliedUnitPrice(product);

                                  return (
                                    <CommandItem
                                      key={product.id}
                                      onSelect={() => {
                                        setSelectedProductId(product.id);
                                        setIsProductPickerOpen(false);
                                      }}
                                      value={`${product.name} ${product.sku} ${product.brand ?? ""} ${product.supplierName ?? ""} ${product.categoryName ?? ""}`}
                                    >
                                      <div className="flex w-full items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate font-medium">
                                            {product.name}
                                          </p>
                                          <p className="text-muted-foreground text-xs">
                                            {product.sku} ·{" "}
                                            {formatPriceByMeasure(
                                              product.price,
                                              product.unitOfMeasure
                                            )}
                                          </p>
                                          {averageLabel ? (
                                            <p className="text-[11px] text-muted-foreground">
                                              Prom: {averageLabel} · Precio
                                              aplicado:{" "}
                                              {formatCurrency(appliedPrice)} x
                                              unidad
                                            </p>
                                          ) : null}
                                        </div>
                                        <Check
                                          className={cn(
                                            "h-4 w-4 shrink-0 text-primary transition-opacity",
                                            selectedProductId === product.id
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
                                      </div>
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
                      <Label htmlFor="quantity">Cantidad</Label>
                      <Input
                        id="quantity"
                        inputMode="decimal"
                        min={0}
                        onChange={(event) => {
                          const parsed = Number.parseFloat(event.target.value);
                          setSelectedQuantity(
                            Number.isNaN(parsed) ? 0 : parsed
                          );
                        }}
                        step="0.01"
                        type="number"
                        value={
                          Number.isNaN(selectedQuantity) ? "" : selectedQuantity
                        }
                      />
                    </div>

                    <div className="flex items-end">
                      <Button
                        className="w-full md:w-auto"
                        onClick={handleAddProduct}
                        type="button"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Agregar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="rounded-lg border">
                {items.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    No hay productos cargados en esta preventa.
                  </div>
                ) : (
                  <div className="divide-y">
                    {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: render logic for item rows */}
                    {items.map((item) => {
                      const averageLabel = formatAveragePerUnit(
                        item.averageQuantityPerUnit,
                        item.unitOfMeasure
                      );
                      const showWeightInput = isWeightOrVolumeUnit(
                        item.unitOfMeasure
                      );

                      return (
                        <div
                          className="grid gap-4 px-4 py-3 sm:grid-cols-[minmax(0,_2fr)_repeat(4,minmax(88px,_1fr))_minmax(120px,_1fr)_auto] sm:items-center sm:pr-0"
                          key={item.id}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{item.name}</p>
                              {item.brand ? (
                                <span className="text-muted-foreground text-xs">
                                  {item.brand}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-muted-foreground text-sm">
                              {item.sku} · {formatCurrency(item.basePrice)} x{" "}
                              {unitOfMeasureLabels[item.unitOfMeasure]}
                            </p>
                            {averageLabel ? (
                              <p className="text-muted-foreground text-xs">
                                Prom: {averageLabel}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Cantidad (uds)
                            </span>
                            <Input
                              className="h-8 w-full min-w-[80px]"
                              disabled={!isEditingDetails}
                              inputMode="decimal"
                              min={0}
                              onChange={(event) =>
                                handleQuantityChange(
                                  item.id,
                                  event.target.value
                                )
                              }
                              step="0.01"
                              type="number"
                              value={
                                Number.isNaN(item.quantity) ? "" : item.quantity
                              }
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Precio unitario
                            </span>
                            <Input
                              className="h-8 w-full min-w-[96px]"
                              disabled={!isEditingDetails}
                              inputMode="decimal"
                              min={0}
                              onChange={(event) =>
                                handleUnitPriceChange(
                                  item.id,
                                  event.target.value
                                )
                              }
                              step="0.01"
                              type="number"
                              value={
                                Number.isNaN(item.unitPrice)
                                  ? ""
                                  : item.unitPrice
                              }
                            />
                          </div>

                          {showWeightInput ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground text-xs">
                                Peso ({unitOfMeasureLabels[item.unitOfMeasure]})
                              </span>
                              <Input
                                className="h-8 w-full min-w-[80px]"
                                disabled={!isEditingDetails}
                                inputMode="decimal"
                                min={0}
                                onChange={(event) =>
                                  handleWeightChange(
                                    item.id,
                                    event.target.value
                                  )
                                }
                                step="0.01"
                                type="number"
                                value={
                                  item.weightQuantity === null ||
                                  Number.isNaN(item.weightQuantity)
                                    ? ""
                                    : item.weightQuantity
                                }
                              />
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground text-xs">
                                Peso
                              </span>
                              <Input
                                className="h-8 w-full"
                                disabled
                                value="No aplica"
                              />
                            </div>
                          )}

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Descuento %
                            </span>
                            <Input
                              className="h-8 w-full min-w-[80px]"
                              disabled={!isEditingDetails}
                              inputMode="decimal"
                              max={100}
                              min={0}
                              onChange={(event) =>
                                handleDiscountChange(
                                  item.id,
                                  event.target.value
                                )
                              }
                              step="0.01"
                              type="number"
                              value={
                                Number.isNaN(item.discountPercent) ||
                                item.discountPercent === 0
                                  ? ""
                                  : item.discountPercent
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between sm:justify-end">
                            <div className="flex flex-col items-start gap-1 sm:items-end">
                              <span className="text-muted-foreground text-xs">
                                Subtotal
                              </span>
                              <p className="font-medium">
                                {formatCurrency(
                                  calculateItemTotals(item).subtotal
                                )}
                              </p>
                              {isEditingDetails ? (
                                <p className="text-[11px] text-muted-foreground">
                                  Desc.: {item.discountPercent || 0}%
                                </p>
                              ) : null}
                            </div>
                            <Button
                              className="ml-2"
                              disabled={!isEditingDetails}
                              onClick={() => handleRemoveItem(item.id)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-full lg:w-80 lg:max-w-xs xl:max-w-sm">
          <div className="sticky top-6 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resumen de venta</CardTitle>
                <CardDescription>
                  Totales y detalle de los productos agregados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Productos ({items.length})
                    </span>
                    <span>{items.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Unidades totales
                    </span>
                    <span>{totals.totalUnits}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Peso estimado</span>
                    <span>
                      {totals.totalWeight > 0
                        ? `${totals.totalWeight.toFixed(2)} ${weightUnitLabel}`
                        : "—"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(totals.subtotal)}</span>
                  </div>
                  {totals.taxDetails.map(({ tax, amount }) => (
                    <div
                      className="flex items-center justify-between"
                      key={tax.id}
                    >
                      <span className="text-muted-foreground">
                        {tax.name} ({tax.rate}%)
                      </span>
                      <span>{formatCurrency(amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Subtotal + imp.
                    </span>
                    <span>{formatCurrency(totals.preDiscountTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">
                        Descuento{" "}
                        {globalDiscountPercent
                          ? `(orden ${globalDiscountPercent}%)`
                          : "(prod. + orden)"}
                      </span>
                      {totals.lineDiscountAmount > 0 ||
                      totals.globalDiscountAmount > 0 ? (
                        <span className="text-muted-foreground text-xs">
                          {totals.lineDiscountAmount > 0
                            ? `Prod: -${formatCurrency(totals.lineDiscountAmount)}`
                            : ""}
                          {totals.lineDiscountAmount > 0 &&
                          totals.globalDiscountAmount > 0
                            ? " · "
                            : ""}
                          {totals.globalDiscountAmount > 0
                            ? `Orden: -${formatCurrency(totals.globalDiscountAmount)}`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                    <span className="font-medium">
                      -{formatCurrency(totals.totalDiscountAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-semibold text-base">
                    <span>Total</span>
                    <span>{formatCurrency(totals.total)}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Vence el {formatDateOnly(dueDate)}
                  </p>
                </div>

                {error ? (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                    {error}
                  </div>
                ) : null}

                {successMessage ? (
                  <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700 text-sm">
                    {successMessage}
                  </div>
                ) : null}
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <Button
                  className="w-full justify-between"
                  disabled={!canConfirm || isSaving}
                  onClick={handleConfirm}
                  title={
                    isDraftSale
                      ? undefined
                      : "Solo preventas en borrador pueden confirmarse."
                  }
                  type="button"
                >
                  {isSaving ? (
                    "Confirmando..."
                  ) : (
                    <div className="flex items-center">
                      <CheckCircleIcon
                        className="mr-2 h-4 w-4"
                        weight="duotone"
                      />
                      Confirmar venta
                    </div>
                  )}
                </Button>
                <div className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-muted-foreground text-xs">
                  <span>Descuento %</span>
                  <Input
                    className="h-8 w-24 text-right"
                    disabled={!isEditingDetails}
                    inputMode="decimal"
                    max={100}
                    min={0}
                    onChange={(event) => {
                      const parsed = Number.parseFloat(event.target.value);
                      setGlobalDiscountPercent(
                        Number.isNaN(parsed)
                          ? 0
                          : Math.min(Math.max(0, parsed), 100)
                      );
                    }}
                    step="0.01"
                    type="number"
                    value={
                      Number.isNaN(globalDiscountPercent) ||
                      globalDiscountPercent === 0
                        ? ""
                        : globalDiscountPercent
                    }
                  />
                </div>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>

      <Dialog
        onOpenChange={setIsDispatchDialogOpen}
        open={isDispatchDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Despachar venta</DialogTitle>
            <DialogDescription>
              Ingresa el número de remito para marcar esta venta como
              despachada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="remittanceNumber">Número de remito</Label>
              <Input
                autoFocus
                id="remittanceNumber"
                onChange={(event) =>
                  setRemittanceNumber(event.target.value.slice(0, 100))
                }
                placeholder="Ej: 0001-00012345"
                value={remittanceNumber}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setIsDispatchDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isDispatching}
              onClick={handleDispatch}
              type="button"
            >
              {isDispatching ? "Despachando..." : "Confirmar despacho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
