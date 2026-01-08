"use client";

import { CalendarIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
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
import { usePreSaleMutation } from "@/modules/sales/hooks/use-pre-sale-mutation";
import type { InvoiceType, SaleProduct } from "@/modules/sales/types";
import { computeDueDate, toDateOnlyString } from "@/modules/sales/utils/date";
import {
  convertToBaseUnits,
  getAvailableUnits,
  getPricePerKg,
  getUnitLabel,
  type InputUnit,
} from "@/modules/sales/utils/sale-calculations";
import { useSalesPriceLists } from "@/modules/sales-price-lists/hooks/use-sales-price-lists";
import type { Tax } from "@/modules/taxes/service/taxes.service";

type PreSaleFormProps = {
  orgSlug: string;
  customers: Customer[];
  sellers: OrganizationMember[];
  products: SaleProduct[];
  taxes: Tax[];
};

type ItemState = {
  productId: string;
  name: string;
  sku: string;
  brand?: string | null;
  quantity: number;
  unitQuantity?: number;
  unitPrice: number;
  basePrice: number;
  unitOfMeasure: SaleProduct["unitOfMeasure"];
  tracksStockUnits: boolean;
  averageQuantityPerUnit: number | null;
  weightPerUnit?: number | null;
  totalWeightKg?: number | null;
  pricePerKg?: number;
  discountPercent: number;
};

const invoiceTypeOptions: { value: InvoiceType; label: string }[] = [
  { value: "NOTA_DE_VENTA", label: "Nota de venta" },
  { value: "FACTURA_A", label: "Factura A" },
  { value: "FACTURA_B", label: "Factura B" },
  { value: "FACTURA_C", label: "Factura C" },
];

const textareaBaseClasses =
  "min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

const unitOfMeasureLabels: Record<SaleProduct["unitOfMeasure"], string> = {
  UN: "unidad",
  KG: "kg",
  LT: "lt",
  MT: "m",
};

const isWeightOrVolumeUnit = (
  unit: SaleProduct["unitOfMeasure"]
): unit is "KG" | "LT" => unit === "KG" || unit === "LT";

const formatPriceByMeasure = (
  price: number,
  unitOfMeasure: SaleProduct["unitOfMeasure"]
): string => `${formatCurrency(price)} x ${unitOfMeasureLabels[unitOfMeasure]}`;

const getModifierKey = (): string => {
  if (typeof window !== "undefined") {
    return navigator.platform.toUpperCase().includes("MAC") ? "⌘" : "Ctrl";
  }
  return "Ctrl";
};

const resolveAppliedUnitPrice = (
  product: SaleProduct,
  adjustedPrice?: number
): number => {
  const basePrice = adjustedPrice ?? product.price;
  const average = product.averageQuantityPerUnit;
  const shouldUseAverage =
    product.tracksStockUnits &&
    isWeightOrVolumeUnit(product.unitOfMeasure) &&
    average !== null &&
    average > 0;

  if (shouldUseAverage) {
    return basePrice * average;
  }

  return basePrice;
};

function buildSellerLabel(member: OrganizationMember): string {
  if (member.user?.name) {
    return member.user.name;
  }

  if (member.user?.email) {
    return member.user.email;
  }

  return "Usuario sin nombre";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI form composition requires several hooks and handlers
export function PreSaleForm({
  orgSlug,
  customers,
  sellers,
  products,
  taxes,
}: PreSaleFormProps) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<string>("");
  const [sellerId, setSellerId] = useState<string>("");
  const [productPrices, setProductPrices] = useState<Map<string, number>>(
    new Map()
  );
  const [_isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [inputUnit, setInputUnit] = useState<InputUnit>("UNITS");
  const [saleDate, setSaleDate] = useState<Date>(new Date());
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("NOTA_DE_VENTA");
  const [observations, setObservations] = useState<string>("");

  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [selectedPrice, setSelectedPrice] = useState<number>(0);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [isSupplierFilterOpen, setIsSupplierFilterOpen] = useState(false);
  const [isBrandFilterOpen, setIsBrandFilterOpen] = useState(false);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [isSellerPickerOpen, setIsSellerPickerOpen] = useState(false);
  const [isTaxesPickerOpen, setIsTaxesPickerOpen] = useState(false);
  const [selectedTaxIds, setSelectedTaxIds] = useState<string[]>([]);
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState<number>(0);

  const [items, setItems] = useState<ItemState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { createPreSale } = usePreSaleMutation(orgSlug);

  const sellerOptions = useMemo(
    () =>
      sellers
        .filter((member) => Boolean(member.user_id))
        .map((member) => ({
          id: member.user_id,
          label: buildSellerLabel(member),
        })),
    [sellers]
  );

  useEffect(() => {
    if (!sellerId && sellerOptions.length) {
      setSellerId(sellerOptions[0].id);
    }
  }, [sellerId, sellerOptions]);

  // Fetch product prices when customer changes
  useEffect(() => {
    if (!customerId || products.length === 0) {
      setProductPrices(new Map());
      return;
    }

    const fetchPrices = async () => {
      setIsLoadingPrices(true);
      try {
        const priceMap = new Map<string, number>();
        const pricePromises = products.map(async (product) => {
          try {
            const response = await fetch(
              `/api/org/${orgSlug}/precios/product-price?productId=${product.id}&customerId=${customerId}`
            );
            if (response.ok) {
              const data = await response.json();
              priceMap.set(product.id, data.price);
            } else {
              // Fallback to base price
              priceMap.set(product.id, product.price);
            }
          } catch {
            // Fallback to base price
            priceMap.set(product.id, product.price);
          }
        });

        await Promise.all(pricePromises);
        setProductPrices(priceMap);
      } catch (priceError) {
        console.error("Error fetching product prices:", priceError);
        // Fallback to base prices
        const fallbackMap = new Map(products.map((p) => [p.id, p.price]));
        setProductPrices(fallbackMap);
      } finally {
        setIsLoadingPrices(false);
      }
    };

    fetchPrices();
  }, [customerId, products, orgSlug]);

  useEffect(() => {
    const product = products.find((p) => p.id === selectedProductId);

    if (product) {
      const adjustedPrice = productPrices.get(product.id);
      setSelectedPrice(resolveAppliedUnitPrice(product, adjustedPrice));
    } else {
      setSelectedPrice(0);
    }
  }, [products, selectedProductId, productPrices]);

  // Update items when product prices change
  useEffect(() => {
    if (items.length === 0 || productPrices.size === 0 || !customerId) {
      return;
    }

    setItems((prevItems) =>
      prevItems.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) {
          return item;
        }

        const adjustedPrice = productPrices.get(item.productId);
        if (adjustedPrice === undefined) {
          return item;
        }

        const newUnitPrice = resolveAppliedUnitPrice(product, adjustedPrice);

        // Only update if price actually changed
        if (Math.abs(item.unitPrice - newUnitPrice) > 0.01) {
          return {
            ...item,
            unitPrice: newUnitPrice,
            basePrice: adjustedPrice,
          };
        }

        return item;
      })
    );
  }, [productPrices, customerId, products, items.length]);

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
    const baseFilteredProducts = supplierFilter
      ? products.filter((p) => p.supplierId === supplierFilter)
      : products;

    for (const product of baseFilteredProducts) {
      const brand = product.brand?.trim();
      if (brand) {
        brands.add(brand);
      }
    }

    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [products, supplierFilter]);

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

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const availableUnits = useMemo(
    () => getAvailableUnits(selectedProduct),
    [selectedProduct]
  );

  useEffect(() => {
    if (selectedProduct && !availableUnits.includes(inputUnit)) {
      setInputUnit(availableUnits[0] ?? "UNITS");
    }
  }, [selectedProduct, availableUnits, inputUnit]);

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

  const selectedTaxes = useMemo(
    () =>
      taxes
        .filter((tax) => selectedTaxIds.includes(tax.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [selectedTaxIds, taxes]
  );

  const calculateItemTotals = useCallback((item: ItemState) => {
    const isWeightOrVolume =
      item.unitOfMeasure === "KG" ||
      item.unitOfMeasure === "LT" ||
      item.unitOfMeasure === "MT";

    let gross: number;
    if (item.totalWeightKg && item.pricePerKg && isWeightOrVolume) {
      gross = item.totalWeightKg * item.pricePerKg;
    } else {
      gross = (item.unitQuantity ?? item.quantity) * item.unitPrice;
    }

    const discount = Math.min(
      Math.max(0, (item.discountPercent / 100) * gross),
      Math.max(0, gross)
    );
    const subtotal = Math.max(0, gross - discount);

    return { gross, discount, subtotal };
  }, []);

  const totals = useMemo(() => {
    const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce(
      (sum, item) => sum + calculateItemTotals(item).subtotal,
      0
    );

    // Apply global discount to subtotal (before taxes)
    const discountAmount = Math.min(
      Math.max(0, (globalDiscountPercent / 100) * subtotal),
      Math.max(0, subtotal)
    );
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

    // Calculate taxes on the subtotal after discount
    const taxDetails = selectedTaxes.map((tax) => ({
      tax,
      amount: subtotalAfterDiscount * (tax.rate / 100),
    }));

    const totalTaxAmount = taxDetails.reduce(
      (sum, detail) => sum + detail.amount,
      0
    );
    const total = subtotalAfterDiscount + totalTaxAmount;

    return {
      totalUnits,
      subtotal,
      subtotalAfterDiscount,
      totalItems: items.length,
      taxDetails,
      totalTaxAmount,
      discountAmount,
      total,
    };
  }, [items, selectedTaxes, globalDiscountPercent, calculateItemTotals]);

  const saleDateString = useMemo(() => toDateOnlyString(saleDate), [saleDate]);
  const expirationDateString = useMemo(
    () => (expirationDate ? toDateOnlyString(expirationDate) : ""),
    [expirationDate]
  );

  const dueDate = useMemo(
    () => computeDueDate(saleDateString, expirationDateString || null),
    [saleDateString, expirationDateString]
  );

  const handleAddItem = () => {
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

    const adjustedPrice = productPrices.get(product.id) ?? product.price;
    const baseQuantity = convertToBaseUnits(
      selectedQuantity,
      inputUnit,
      product
    );

    const unitOfMeasure = product.unitOfMeasure;
    const weightPerUnit = product.weightPerUnit;
    const isWeightOrVolume =
      unitOfMeasure === "KG" ||
      unitOfMeasure === "LT" ||
      unitOfMeasure === "MT";

    let unitQuantity: number;
    let totalWeight: number | null = null;

    if (isWeightOrVolume && weightPerUnit && weightPerUnit > 0) {
      unitQuantity = baseQuantity * weightPerUnit;
      totalWeight = unitQuantity;
    } else {
      unitQuantity = baseQuantity;
    }

    const pricePerKg = getPricePerKg(unitOfMeasure, adjustedPrice);
    const unitPrice = Number.isFinite(selectedPrice)
      ? selectedPrice
      : adjustedPrice;

    setItems((prev) => {
      const exists = prev.find((item) => item.productId === product.id);

      if (exists) {
        const existingQuantity = exists.quantity;
        const newQuantity = existingQuantity + baseQuantity;
        let newUnitQuantity: number;
        let newTotalWeight: number | null = null;

        if (isWeightOrVolume && weightPerUnit && weightPerUnit > 0) {
          newUnitQuantity = newQuantity * weightPerUnit;
          newTotalWeight = newUnitQuantity;
        } else {
          newUnitQuantity = newQuantity;
        }

        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: newQuantity,
                unitQuantity: newUnitQuantity,
                unitPrice,
                basePrice: adjustedPrice,
                totalWeightKg: newTotalWeight,
                pricePerKg,
                unitOfMeasure: product.unitOfMeasure,
                tracksStockUnits: product.tracksStockUnits,
                weightPerUnit: product.weightPerUnit,
              }
            : item
        );
      }

      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          brand: product.brand,
          quantity: baseQuantity,
          unitQuantity,
          unitPrice,
          basePrice: adjustedPrice,
          unitOfMeasure: product.unitOfMeasure,
          tracksStockUnits: product.tracksStockUnits,
          averageQuantityPerUnit: product.averageQuantityPerUnit,
          weightPerUnit: product.weightPerUnit,
          totalWeightKg: totalWeight,
          pricePerKg,
          discountPercent: 0,
        },
      ];
    });

    setSelectedProductId("");
    setSelectedQuantity(1);
    setSelectedPrice(0);
    setInputUnit("UNITS");
    setError(null);
  };

  const handleRemoveItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleUpdateItemQuantity = (productId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) {
          return item;
        }

        const validatedQuantity = Math.max(0, quantity);
        const isWeightOrVolume =
          item.unitOfMeasure === "KG" ||
          item.unitOfMeasure === "LT" ||
          item.unitOfMeasure === "MT";

        let unitQuantity: number;
        let totalWeight: number | null = null;

        if (isWeightOrVolume && item.weightPerUnit && item.weightPerUnit > 0) {
          unitQuantity = validatedQuantity * item.weightPerUnit;
          totalWeight = unitQuantity;
        } else {
          unitQuantity = validatedQuantity;
        }

        return {
          ...item,
          quantity: validatedQuantity,
          unitQuantity,
          totalWeightKg: totalWeight,
        };
      })
    );
  };

  const handleUpdateItemDiscountPercent = (
    productId: string,
    discountPercent: number
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) {
          return item;
        }

        const validatedDiscount = Math.min(Math.max(0, discountPercent), 100);

        return {
          ...item,
          discountPercent: validatedDiscount,
        };
      })
    );
  };

  const canSubmit =
    Boolean(customerId) && Boolean(sellerId) && items.length > 0;
  const isSaving = createPreSale.isPending;

  const onSubmit = async () => {
    if (!canSubmit) {
      setError("Completa los datos requeridos antes de guardar");
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);

      const selectedTaxPayload = selectedTaxes.map((tax) => ({
        taxId: tax.id,
        name: tax.name,
        rate: tax.rate,
      }));

      await createPreSale.mutateAsync({
        customerId,
        sellerId,
        saleDate: saleDateString,
        expirationDate: expirationDateString || null,
        invoiceType,
        observations: observations || null,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          weightQuantity: item.unitQuantity ?? null,
          unitPrice: item.unitPrice,
          basePrice: item.basePrice,
          discountAmount: (() => {
            const isWeightOrVolume =
              item.unitOfMeasure === "KG" ||
              item.unitOfMeasure === "LT" ||
              item.unitOfMeasure === "MT";
            const effectiveQuantity = item.unitQuantity ?? item.quantity;
            const effectiveUnitPrice =
              isWeightOrVolume && item.pricePerKg
                ? item.pricePerKg
                : item.unitPrice;

            const gross = effectiveQuantity * effectiveUnitPrice;
            const discountPercent = Math.min(
              Math.max(0, item.discountPercent),
              100
            );
            return (discountPercent / 100) * gross;
          })(),
          discountPercentage: Math.min(Math.max(0, item.discountPercent), 100),
        })),
        globalDiscountPercentage: Math.min(
          Math.max(0, globalDiscountPercent),
          100
        ),
        globalDiscountAmount: totals.discountAmount,
        taxes: selectedTaxPayload.length ? selectedTaxPayload : undefined,
      });

      setSuccessMessage("Preventa creada correctamente");
      setItems([]);
      setObservations("");
      router.push(`/org/${orgSlug}/ventas`);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo guardar la preventa, intenta nuevamente"
      );
    }
  };

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );
  const selectedSeller = sellerOptions.find((seller) => seller.id === sellerId);

  // Get sales price lists to find the one assigned to the customer
  const { data: salesPriceLists = [] } = useSalesPriceLists(orgSlug);
  const customerPriceList = useMemo(() => {
    if (!selectedCustomer?.sales_price_list_id) {
      return null;
    }
    return (
      salesPriceLists.find(
        (list) => list.id === selectedCustomer.sales_price_list_id
      ) ?? null
    );
  }, [selectedCustomer, salesPriceLists]);

  const handleCustomerSelect = (id: string) => {
    setCustomerId(id);
    setIsCustomerPickerOpen(false);
    // Prices will be recalculated in the useEffect above
    // Also update existing items with new prices
    if (items.length > 0) {
      const updateItemsWithNewPrices = async () => {
        const _updatedItems = await Promise.all(
          items.map(async (item) => {
            const product = products.find((p) => p.id === item.productId);
            if (!product) {
              return item;
            }

            try {
              const response = await fetch(
                `/api/org/${orgSlug}/precios/product-price?productId=${item.productId}&customerId=${id}`
              );
              if (response.ok) {
                const data = await response.json();
                const adjustedPrice = data.price;
                const newUnitPrice = resolveAppliedUnitPrice(
                  product,
                  adjustedPrice
                );
                return {
                  ...item,
                  unitPrice: newUnitPrice,
                  basePrice: adjustedPrice,
                };
              }
            } catch {
              // Keep existing price if fetch fails
            }
            return item;
          })
        );
        // Note: We'll update items after prices are loaded in the useEffect
      };
      updateItemsWithNewPrices();
    }
  };

  const handleSellerSelect = (id: string) => {
    setSellerId(id);
    setIsSellerPickerOpen(false);
  };

  const handleTaxToggle = (taxId: string) => {
    setSelectedTaxIds((prev) =>
      prev.includes(taxId)
        ? prev.filter((id) => id !== taxId)
        : [...prev, taxId]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/org/${orgSlug}/ventas?estado=DRAFT`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver a Preventas
          </Button>
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl">Nueva preventa</h1>
        <p className="text-muted-foreground">
          Completa los datos de la preventa y agrega los productos.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="customer">Cliente *</Label>
                  <Popover
                    onOpenChange={setIsCustomerPickerOpen}
                    open={isCustomerPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isCustomerPickerOpen}
                        className="w-full justify-between text-left font-normal"
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
                      className="w-xs max-w-[90vw] p-0"
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
                                  onSelect={() =>
                                    handleCustomerSelect(customer.id)
                                  }
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
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs">
                      Selecciona el cliente de esta preventa.
                    </p>
                    {customerPriceList && (
                      <p className="text-muted-foreground text-xs">
                        <span className="font-medium">Lista de precios:</span>{" "}
                        {customerPriceList.name} (
                        {customerPriceList.percentage > 0 ? "+" : ""}
                        {customerPriceList.percentage}%)
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seller">Vendedor *</Label>
                  <Popover
                    onOpenChange={setIsSellerPickerOpen}
                    open={isSellerPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isSellerPickerOpen}
                        className="w-full justify-between text-left font-normal"
                        id="seller"
                        role="combobox"
                        variant="outline"
                      >
                        <span className="truncate">
                          {selectedSeller
                            ? selectedSeller.label
                            : "Selecciona un vendedor"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-xs max-w-[90vw] p-0"
                      sideOffset={8}
                    >
                      <Command>
                        <CommandInput placeholder="Buscar vendedor..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {sellerOptions.map((seller) => (
                              <CommandItem
                                key={seller.id}
                                onSelect={() => handleSellerSelect(seller.id)}
                                value={seller.label}
                              >
                                <span className="flex-1 truncate">
                                  {seller.label}
                                </span>
                                <Check
                                  className={cn(
                                    "h-4 w-4 shrink-0 text-primary transition-opacity",
                                    sellerId === seller.id
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
                  <Label htmlFor="saleDate">Fecha de venta *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !saleDate && "text-muted-foreground"
                        )}
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
                  <Label htmlFor="expirationDate">Fecha de vencimiento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !expirationDate && "text-muted-foreground"
                        )}
                        id="expirationDate"
                        variant="outline"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {expirationDate ? (
                          format(expirationDate, "PPP", { locale: es })
                        ) : (
                          <span>Seleccione una fecha</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        disabled={(date) =>
                          saleDate ? date < saleDate : false
                        }
                        initialFocus
                        locale={es}
                        mode="single"
                        onSelect={(date) => setExpirationDate(date ?? null)}
                        selected={expirationDate ?? undefined}
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-muted-foreground text-xs">
                    Si la dejas vacía, usamos la fecha de venta.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invoiceType">Tipo de comprobante</Label>
                  <Select
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
                                <span
                                  aria-hidden="true"
                                  className="ml-1 flex h-5 w-5 items-center justify-center rounded-sm transition-colors hover:bg-muted"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleTaxToggle(tax.id);
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </span>
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
                            {taxes.map((tax) => (
                              <CommandItem
                                key={tax.id}
                                onSelect={() => handleTaxToggle(tax.id)}
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
                    Seleccione los impuestos que se aplicarán a esta preventa.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observations">Observaciones</Label>
                <textarea
                  className={textareaBaseClasses}
                  id="observations"
                  onChange={(event) => setObservations(event.target.value)}
                  placeholder="Notas internas o comentarios del cliente"
                  value={observations}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Productos de la preventa
              </CardTitle>
              <CardDescription>
                Agrega los productos y cantidades de esta preventa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
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
                                  supplierFilter ? "opacity-0" : "opacity-100"
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
                                <span className="flex-1 truncate">{brand}</span>
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
                                  categoryFilter ? "opacity-0" : "opacity-100"
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

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="product">Producto</Label>
                  <Popover
                    onOpenChange={setIsProductPickerOpen}
                    open={isProductPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isProductPickerOpen}
                        className="h-auto min-h-9 w-full justify-between py-2 text-left font-normal"
                        id="product"
                        role="combobox"
                        variant="outline"
                      >
                        {selectedProduct ? (
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                            <span className="truncate font-medium">
                              {selectedProduct.name}
                            </span>
                            <span className="truncate text-muted-foreground text-xs leading-normal">
                              SKU {selectedProduct.sku} ·{" "}
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
                              const adjustedPrice = productPrices.get(
                                product.id
                              );
                              const displayPrice =
                                adjustedPrice ?? product.price;
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
                                          displayPrice,
                                          product.unitOfMeasure
                                        )}
                                      </p>
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

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2 md:col-span-1">
                    <Label htmlFor="inputUnit">Unidad</Label>
                    <Select
                      disabled={!selectedProduct}
                      onValueChange={(value) =>
                        setInputUnit(value as InputUnit)
                      }
                      value={inputUnit}
                    >
                      <SelectTrigger className="w-full" id="inputUnit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedProduct && availableUnits.length > 0
                          ? availableUnits
                          : (["UNITS"] as InputUnit[])
                        ).map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {getUnitLabel(unit)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="quantity">
                      {selectedProduct ? getUnitLabel(inputUnit) : "Cantidad"}
                    </Label>
                    <Input
                      id="quantity"
                      inputMode="decimal"
                      min={0}
                      onChange={(event) => {
                        const parsed = Number.parseFloat(event.target.value);
                        setSelectedQuantity(Number.isNaN(parsed) ? 0 : parsed);
                      }}
                      step="0.01"
                      type="number"
                      value={
                        Number.isNaN(selectedQuantity) ? "" : selectedQuantity
                      }
                    />
                  </div>

                  <div className="flex items-end sm:col-span-2 md:col-span-1">
                    <Button
                      className="w-full"
                      onClick={handleAddItem}
                      type="button"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border">
                {items.length === 0 ? (
                  <Empty className="rounded-none border-none bg-transparent">
                    <EmptyContent>
                      <EmptyTitle>Sin productos agregados</EmptyTitle>
                      <EmptyDescription>
                        Selecciona un producto y cantidad para sumarlo a la
                        preventa.
                      </EmptyDescription>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <div className="divide-y">
                    {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: render logic for item rows */}
                    {items.map((saleItem) => {
                      // biome-ignore lint/nursery/noShadow: unitOfMeasureLabels is a local variable
                      const unitOfMeasureLabels: Record<
                        SaleProduct["unitOfMeasure"],
                        string
                      > = {
                        UN: "unidad",
                        KG: "kg",
                        LT: "lt",
                        MT: "m",
                      };
                      const unitLabel =
                        unitOfMeasureLabels[saleItem.unitOfMeasure] ||
                        saleItem.unitOfMeasure;

                      const itemIsWeightOrVolume =
                        saleItem.unitOfMeasure === "KG" ||
                        saleItem.unitOfMeasure === "LT" ||
                        saleItem.unitOfMeasure === "MT";

                      let measureLabel = "Medida";
                      if (itemIsWeightOrVolume) {
                        if (saleItem.unitOfMeasure === "KG") {
                          measureLabel = "Peso (kg)";
                        } else if (saleItem.unitOfMeasure === "LT") {
                          measureLabel = "Volumen (lt)";
                        } else if (saleItem.unitOfMeasure === "MT") {
                          measureLabel = "Longitud (m)";
                        }
                      }

                      let measureValue: number | undefined;
                      if (itemIsWeightOrVolume) {
                        if (saleItem.unitOfMeasure === "KG") {
                          measureValue = saleItem.totalWeightKg ?? undefined;
                        } else {
                          measureValue = saleItem.unitQuantity ?? undefined;
                        }
                      }

                      return (
                        <div
                          className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1.5fr)_80px_100px_80px_80px_120px_auto] sm:items-center"
                          key={saleItem.productId}
                        >
                          <div className="col-span-2 min-w-0 sm:col-span-1">
                            <p className="wrap-break-word font-medium">
                              {saleItem.name}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              {saleItem.brand ? (
                                <span className="text-muted-foreground text-xs">
                                  {saleItem.brand}
                                </span>
                              ) : null}
                              <span className="text-muted-foreground text-xs">
                                SKU {saleItem.sku}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Cantidad
                            </span>
                            <Input
                              className="h-8 w-full"
                              inputMode="decimal"
                              min={0}
                              onChange={(event) => {
                                const value = Number.parseFloat(
                                  event.target.value
                                );
                                if (!Number.isNaN(value) && value >= 0) {
                                  handleUpdateItemQuantity(
                                    saleItem.productId,
                                    value
                                  );
                                } else if (event.target.value === "") {
                                  handleUpdateItemQuantity(
                                    saleItem.productId,
                                    0
                                  );
                                }
                              }}
                              step="0.01"
                              type="number"
                              value={
                                Number.isNaN(saleItem.quantity)
                                  ? ""
                                  : saleItem.quantity
                              }
                            />
                          </div>

                          {itemIsWeightOrVolume && (
                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground text-xs">
                                {measureLabel}
                              </span>
                              <span className="text-sm">
                                {(() => {
                                  if (!itemIsWeightOrVolume) {
                                    return unitLabel;
                                  }
                                  if (
                                    measureValue !== undefined &&
                                    measureValue > 0
                                  ) {
                                    return `${measureValue.toLocaleString(
                                      "es-AR",
                                      {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      }
                                    )} ${unitLabel}`;
                                  }
                                  return unitLabel;
                                })()}
                              </span>
                            </div>
                          )}

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Precio
                            </span>
                            <span className="font-medium text-sm">
                              {itemIsWeightOrVolume && saleItem.weightPerUnit
                                ? formatCurrency(saleItem.pricePerKg ?? 0)
                                : formatCurrency(saleItem.unitPrice)}
                            </span>
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Descuento %
                            </span>
                            <Input
                              className="h-8 w-full"
                              inputMode="decimal"
                              max={100}
                              min={0}
                              onChange={(event) => {
                                const value = Number.parseFloat(
                                  event.target.value
                                );
                                if (!Number.isNaN(value) && value >= 0) {
                                  handleUpdateItemDiscountPercent(
                                    saleItem.productId,
                                    value
                                  );
                                } else if (event.target.value === "") {
                                  handleUpdateItemDiscountPercent(
                                    saleItem.productId,
                                    0
                                  );
                                }
                              }}
                              step="0.01"
                              type="number"
                              value={
                                Number.isNaN(saleItem.discountPercent) ||
                                saleItem.discountPercent === 0
                                  ? ""
                                  : saleItem.discountPercent
                              }
                            />
                          </div>

                          <div className="flex flex-col items-start gap-1 sm:items-end">
                            <span className="text-muted-foreground text-xs">
                              Subtotal
                            </span>
                            <p className="font-medium">
                              {formatCurrency(
                                calculateItemTotals(saleItem).subtotal
                              )}
                            </p>
                          </div>

                          <div className="col-span-2 flex items-center justify-end sm:col-span-1 sm:justify-end">
                            <Button
                              className="shrink-0"
                              onClick={() =>
                                handleRemoveItem(saleItem.productId)
                              }
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
                <CardTitle className="text-lg">Resumen de preventa</CardTitle>
                <CardDescription>
                  Totales y detalle de los productos agregados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Productos ({totals.totalItems})
                    </span>
                    <span>{totals.totalItems}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Unidades totales
                    </span>
                    <span>{totals.totalUnits}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(totals.subtotal)}</span>
                  </div>
                  {globalDiscountPercent > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Descuento{" "}
                        {globalDiscountPercent
                          ? `(${globalDiscountPercent}%)`
                          : ""}
                      </span>
                      <span className="font-medium">
                        -{formatCurrency(totals.discountAmount)}
                      </span>
                    </div>
                  )}
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
              <CardFooter>
                <Button
                  className="w-full justify-between"
                  disabled={!canSubmit || isSaving}
                  onClick={onSubmit}
                  type="button"
                >
                  {isSaving ? (
                    "Guardando..."
                  ) : (
                    <>
                      <div className="flex items-center">
                        <FloppyDiskIcon
                          className="mr-2 h-4 w-4"
                          weight="duotone"
                        />
                        Guardar preventa
                      </div>
                      <KbdGroup>
                        <Kbd>{getModifierKey()}</Kbd>
                        <Kbd>Enter</Kbd>
                      </KbdGroup>
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Descuento de la orden
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-muted-foreground text-sm">
                    Descuento %
                  </span>
                  <Input
                    className="h-9 w-28"
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
                <div className="text-right">
                  <span className="block text-muted-foreground text-xs">
                    Descuento aplicado
                  </span>
                  <span className="font-semibold">
                    -{formatCurrency(totals.discountAmount)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
