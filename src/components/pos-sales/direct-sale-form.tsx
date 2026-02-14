"use client";

import { CalendarIcon, FloppyDiskIcon, PlusMinus } from "@phosphor-icons/react";
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
import type { PaymentMethod } from "@/modules/collections/types";
import type { Customer } from "@/modules/customers/types";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";
import { useDirectSaleMutation } from "@/modules/pos-sales/hooks/use-direct-sale-mutation";
import type { SaleItemType, SaleProduct } from "@/modules/sales/types";
import { toDateOnlyString } from "@/modules/sales/utils/date";
import {
  convertToBaseUnits,
  getAvailableUnits,
  getPricePerKg,
  getUnitLabel,
  type InputUnit,
} from "@/modules/sales/utils/sale-calculations";
import { useSalesPriceLists } from "@/modules/sales-price-lists/hooks/use-sales-price-lists";
import type { Tax } from "@/modules/taxes/service/taxes.service";

type DirectSaleFormProps = {
  orgSlug: string;
  customers: Customer[];
  sellers: OrganizationMember[];
  products: SaleProduct[];
  taxes: Tax[];
};

type ItemState = {
  id: string;
  type: SaleItemType;
  productId: string | null;
  description?: string | null;
  name: string;
  sku: string;
  brand?: string | null;
  quantity: number;
  unitQuantity?: number;
  unitPrice: number;
  // Precio de lista de base, usado solo como referencia
  basePrice: number;
  unitOfMeasure: SaleProduct["unitOfMeasure"];
  tracksStockUnits: boolean;
  averageQuantityPerUnit: number | null;
  weightPerUnit?: number | null;
  totalWeightKg?: number | null;
  pricePerKg?: number;
  discountPercent: number;
};

const updateItemUnitPrice = (item: ItemState, unitPrice: number): ItemState => {
  if (item.type === "adjustment") {
    return {
      ...item,
      unitPrice,
      basePrice: unitPrice,
    };
  }

  const isWeightOrVolume =
    item.unitOfMeasure === "KG" ||
    item.unitOfMeasure === "LT" ||
    item.unitOfMeasure === "MT";

  return {
    ...item,
    unitPrice,
    basePrice: isWeightOrVolume ? unitPrice : item.basePrice,
    pricePerKg: isWeightOrVolume ? unitPrice : item.pricePerKg,
  };
};

const clampPercentage = (value: number) => Math.min(Math.max(0, value), 100);

const resolveItemWeightQuantity = (item: ItemState): number | null => {
  if (item.type === "adjustment") {
    return null;
  }

  const isWeightOrVolume =
    item.unitOfMeasure === "KG" ||
    item.unitOfMeasure === "LT" ||
    item.unitOfMeasure === "MT";

  if (!isWeightOrVolume) {
    return null;
  }

  const rawWeightQuantity = item.totalWeightKg ?? item.unitQuantity ?? null;
  if (
    rawWeightQuantity === null ||
    !Number.isFinite(rawWeightQuantity) ||
    rawWeightQuantity <= 0
  ) {
    return null;
  }

  return rawWeightQuantity;
};

const buildPreSaleItemPayload = (
  item: ItemState,
  calculateItemTotals: (entry: ItemState) => { discount: number }
) => {
  const isAdjustment = item.type === "adjustment";
  const { discount } = calculateItemTotals(item);

  return {
    type: item.type,
    productId: isAdjustment ? null : item.productId,
    description: isAdjustment ? item.name : null,
    quantity: isAdjustment ? 1 : item.quantity,
    weightQuantity: resolveItemWeightQuantity(item),
    unitPrice: item.unitPrice,
    basePrice: item.basePrice,
    discountAmount: isAdjustment ? 0 : Math.max(0, discount),
    discountPercentage: isAdjustment
      ? 0
      : clampPercentage(item.discountPercent),
  };
};

const paymentMethodOptions: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta_de_credito", label: "Tarjeta de crédito" },
  { value: "tarjeta_de_debito", label: "Tarjeta de débito" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
  { value: "deposito", label: "Depósito" },
  { value: "e-cheq", label: "E-Cheq" },
];

const textareaBaseClasses =
  "min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

const unitOfMeasureLabels: Record<SaleProduct["unitOfMeasure"], string> = {
  UN: "unidad",
  KG: "kg",
  LT: "lt",
  MT: "m",
};

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

function buildSellerLabel(member: OrganizationMember): string {
  if (member.user?.name) {
    return member.user.name;
  }

  if (member.user?.email) {
    return member.user.email;
  }

  return "Usuario sin nombre";
}

const normalizeSearchValue = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const toSearchTokens = (value: string) => {
  const normalized = normalizeSearchValue(value);
  if (!normalized) {
    return [];
  }
  return normalized.split(" ").filter(Boolean);
};

const normalizeComparableText = (value?: string | null) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const isConsumerFinalCustomer = (customer: Customer) => {
  const businessName = normalizeComparableText(customer.business_name);
  const fantasyName = normalizeComparableText(customer.fantasy_name);
  return (
    businessName.includes("consumidor final") ||
    fantasyName.includes("consumidor final")
  );
};

const matchesProductSearch = (product: SaleProduct, searchTokens: string[]) => {
  if (searchTokens.length === 0) {
    return true;
  }

  const nameTokens = toSearchTokens(product.name);
  const sku = normalizeSearchValue(product.sku);

  return searchTokens.every((token) => {
    if (sku.startsWith(token)) {
      return true;
    }
    return nameTokens.some((word) => word.startsWith(token));
  });
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI form composition requires several hooks and handlers
export function DirectSaleForm({
  orgSlug,
  customers,
  sellers,
  products,
  taxes,
}: DirectSaleFormProps) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<string>("");
  const [sellerId, setSellerId] = useState<string>("");
  const [productPrices, setProductPrices] = useState<Map<string, number>>(
    new Map()
  );
  const [_isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [inputUnit, setInputUnit] = useState<InputUnit>("UNITS");
  const [saleDate, setSaleDate] = useState<Date>(new Date());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [observations, setObservations] = useState<string>("");

  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState<string>("");
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
  const { createDirectSale } = useDirectSaleMutation(orgSlug);

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

  useEffect(() => {
    if (customerId || customers.length === 0) {
      return;
    }

    const consumerFinalCustomer =
      customers.find((customer) => isConsumerFinalCustomer(customer)) ??
      customers[0];

    setCustomerId(consumerFinalCustomer.id);
  }, [customers, customerId]);

  // Get sales price lists to find the one assigned to the customer
  const { data: salesPriceLists = [] } = useSalesPriceLists(orgSlug);
  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );
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

  // Calculate product prices when customer or price list changes
  useEffect(() => {
    if (products.length === 0) {
      setProductPrices(new Map());
      return;
    }

    setIsLoadingPrices(true);
    try {
      const priceMap = new Map<string, number>();

      // Get customer's price list percentage
      let priceListPercentage = 0;

      if (selectedCustomer?.sales_price_list_id && customerPriceList) {
        // Check if price list is active and valid
        const today = new Date().toISOString().split("T")[0];
        if (
          customerPriceList.is_active &&
          customerPriceList.valid_from <= today
        ) {
          priceListPercentage = customerPriceList.percentage;
        }
      }

      // Calculate prices for all products at once
      for (const product of products) {
        const basePrice = product.price;
        const adjustedPrice = basePrice * (1 + priceListPercentage / 100);
        priceMap.set(product.id, adjustedPrice);
      }

      setProductPrices(priceMap);
    } catch (priceError) {
      console.error("Error calculating product prices:", priceError);
      // Fallback to base prices
      const fallbackMap = new Map(products.map((p) => [p.id, p.price]));
      setProductPrices(fallbackMap);
    } finally {
      setIsLoadingPrices(false);
    }
  }, [products, selectedCustomer, customerPriceList]);

  // Update items when product prices change
  useEffect(() => {
    if (items.length === 0 || productPrices.size === 0) {
      return;
    }

    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.type !== "product" || !item.productId) {
          return item;
        }

        const adjustedPrice = productPrices.get(item.productId);
        if (adjustedPrice === undefined) {
          return item;
        }

        // Only update if price actually changed
        if (Math.abs(item.unitPrice - adjustedPrice) > 0.01) {
          return {
            ...item,
            unitPrice: adjustedPrice,
            basePrice: adjustedPrice,
          };
        }

        return item;
      })
    );
  }, [productPrices, items.length]);

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

  const productSearchTokens = useMemo(
    () => toSearchTokens(productSearch),
    [productSearch]
  );

  const searchedProducts = useMemo(
    () =>
      filteredProducts.filter((product) =>
        matchesProductSearch(product, productSearchTokens)
      ),
    [filteredProducts, productSearchTokens]
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
    if (item.type === "adjustment") {
      const subtotal = Number(item.unitPrice) || 0;
      return { gross: subtotal, discount: 0, subtotal };
    }

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
    const aggregated = items.reduce(
      (acc, item) => {
        const { discount, subtotal } = calculateItemTotals(item);
        const isProduct = item.type === "product";
        return {
          subtotal: acc.subtotal + subtotal,
          totalUnits: acc.totalUnits + (isProduct ? item.quantity : 0),
          lineDiscountAmount:
            acc.lineDiscountAmount + (isProduct ? discount : 0),
          totalItems: acc.totalItems + (isProduct ? 1 : 0),
          adjustmentsTotal: acc.adjustmentsTotal + (isProduct ? 0 : subtotal),
        };
      },
      {
        subtotal: 0,
        totalUnits: 0,
        lineDiscountAmount: 0,
        totalItems: 0,
        adjustmentsTotal: 0,
      }
    );

    // Apply global discount to subtotal (before taxes)
    const globalDiscountAmount = Math.min(
      Math.max(0, (globalDiscountPercent / 100) * aggregated.subtotal),
      Math.max(0, aggregated.subtotal)
    );
    const subtotalAfterDiscount = Math.max(
      0,
      aggregated.subtotal - globalDiscountAmount
    );

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
    const totalDiscountAmount =
      aggregated.lineDiscountAmount + globalDiscountAmount;

    return {
      totalUnits: aggregated.totalUnits,
      subtotal: aggregated.subtotal,
      subtotalAfterDiscount,
      totalItems: aggregated.totalItems,
      adjustmentsTotal: aggregated.adjustmentsTotal,
      taxDetails,
      totalTaxAmount,
      lineDiscountAmount: aggregated.lineDiscountAmount,
      globalDiscountAmount,
      totalDiscountAmount,
      total,
    };
  }, [items, selectedTaxes, globalDiscountPercent, calculateItemTotals]);

  const saleDateString = useMemo(() => toDateOnlyString(saleDate), [saleDate]);
  const dueDate = saleDateString;

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
    const unitPrice = adjustedPrice;

    setItems((prev) => {
      const exists = prev.find(
        (item) => item.type === "product" && item.productId === product.id
      );

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
          item.id === exists.id
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
          id: product.id,
          type: "product",
          productId: product.id,
          description: null,
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
    setInputUnit("UNITS");
    setError(null);
  };

  const handleAdjustmentNameChange = (itemId: string, value: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              name: value,
              description: value,
            }
          : item
      )
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleUpdateItemQuantity = (itemId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId || item.type === "adjustment") {
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

  const handleUpdateItemUnitPrice = (itemId: string, unitPrice: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? updateItemUnitPrice(item, unitPrice) : item
      )
    );
  };

  const handleUpdateItemDiscountPercent = (
    itemId: string,
    discountPercent: number
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId || item.type === "adjustment") {
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

  const handleQuantityInputChange = (itemId: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const nextQuantity = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;

    handleUpdateItemQuantity(itemId, nextQuantity);
  };

  const handleUnitPriceInputChange = (itemId: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const item = items.find((entry) => entry.id === itemId);
    const allowNegative = item?.type === "adjustment";
    let nextPrice = 0;
    if (!Number.isNaN(parsed)) {
      nextPrice = allowNegative ? parsed : Math.max(0, parsed);
    }

    handleUpdateItemUnitPrice(itemId, nextPrice);
  };

  const handleDiscountInputChange = (itemId: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const nextDiscount = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;

    handleUpdateItemDiscountPercent(itemId, nextDiscount);
  };

  const canSubmit = Boolean(sellerId) && items.length > 0;
  const isSaving = createDirectSale.isPending;

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

      if (items.some((item) => item.type === "adjustment")) {
        setError(
          "La venta directa no admite ajustes manuales. Elimina los ajustes para continuar."
        );
        return;
      }

      const directSaleItems = items
        .map((item) => buildPreSaleItemPayload(item, calculateItemTotals))
        .filter(
          (
            item
          ): item is ReturnType<typeof buildPreSaleItemPayload> & {
            productId: string;
          } =>
            item.type === "product" &&
            typeof item.productId === "string" &&
            item.productId.length > 0
        )
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          weightQuantity: item.weightQuantity ?? null,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount ?? 0,
          discountPercentage: item.discountPercentage ?? 0,
        }));

      if (!directSaleItems.length) {
        setError("Agrega al menos un producto para registrar la venta directa");
        return;
      }

      await createDirectSale.mutateAsync({
        customerId: customerId || null,
        sellerId,
        saleDate: saleDateString,
        paymentMethod,
        items: directSaleItems,
        globalDiscountPercentage: Math.min(
          Math.max(0, globalDiscountPercent),
          100
        ),
        taxes: selectedTaxPayload.length ? selectedTaxPayload : undefined,
      });

      setSuccessMessage("Venta directa registrada correctamente");
      setItems([]);
      setObservations("");
      router.push(`/org/${orgSlug}/venta-directa`);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo registrar la venta directa, intenta nuevamente"
      );
    }
  };

  const selectedSeller = sellerOptions.find((seller) => seller.id === sellerId);

  const handleCustomerSelect = (id: string) => {
    setCustomerId(id);
    setIsCustomerPickerOpen(false);
    // Prices will be recalculated in the useEffect above
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/org/${orgSlug}/venta-directa`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver a Venta Directa
          </Button>
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl">Nueva venta directa</h1>
        <p className="text-muted-foreground">
          Completa la operación para registrar una venta inmediata a consumidor
          final.
        </p>
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
                        id="customer"
                        role="combobox"
                        variant="outline"
                      >
                        <span className="truncate">
                          {selectedCustomer
                            ? selectedCustomer.fantasy_name ||
                              selectedCustomer.business_name
                            : "Consumidor final (opcional)"}
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
                      Para venta directa recomendamos consumidor final. Puedes
                      cambiarlo por otro cliente.
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
                      className="w-[320px] max-w-[90vw] p-0"
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
                  <Label htmlFor="paymentMethod">Método de pago</Label>
                  <Select
                    onValueChange={(value) =>
                      setPaymentMethod(value as PaymentMethod)
                    }
                    value={paymentMethod}
                  >
                    <SelectTrigger className="w-full" id="paymentMethod">
                      <SelectValue placeholder="Método de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethodOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Venta directa: cobro al momento y entrega inmediata.
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
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
                    Seleccione los impuestos que se aplicarán a esta venta.
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
                Productos de la venta directa
              </CardTitle>
              <CardDescription>
                Agrega los productos y cantidades para cobrar en el momento.
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
                        className="w-full justify-between px-2 py-6 text-left font-normal"
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
                              SKU {selectedProduct.sku} ·{" "}
                              {formatPriceByMeasure(
                                productPrices.get(selectedProduct.id) ??
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
                      <Command shouldFilter={false}>
                        <CommandInput
                          onValueChange={setProductSearch}
                          placeholder="Buscar producto por nombre o SKU..."
                          value={productSearch}
                        />
                        <CommandList>
                          {searchedProducts.length === 0 ? (
                            <CommandEmpty>
                              No se encontraron productos para los filtros
                              aplicados.
                            </CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {searchedProducts.map((product) => {
                                const adjustedPrice =
                                  productPrices.get(product.id) ??
                                  product.price;
                                return (
                                  <CommandItem
                                    key={product.id}
                                    onSelect={() => {
                                      setSelectedProductId(product.id);
                                      setIsProductPickerOpen(false);
                                    }}
                                    value={`${product.name} ${product.sku}`}
                                  >
                                    <div className="flex w-full items-start gap-3">
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">
                                          {product.name}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                          SKU {product.sku} ·{" "}
                                          {formatPriceByMeasure(
                                            adjustedPrice,
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
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                  {selectedProduct && availableUnits.length > 1 && (
                    <div className="w-full space-y-2 sm:flex-1">
                      <Label htmlFor="inputUnit">Unidad</Label>
                      <Select
                        onValueChange={(value) =>
                          setInputUnit(value as InputUnit)
                        }
                        value={inputUnit}
                      >
                        <SelectTrigger className="w-full" id="inputUnit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableUnits.map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {getUnitLabel(unit)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="w-full space-y-2 sm:flex-1">
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

                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-shrink-0">
                    <Button
                      className="w-full whitespace-nowrap"
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
                        venta directa.
                      </EmptyDescription>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <div className="divide-y">
                    {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: render logic for item rows */}
                    {items.map((item) => {
                      const isAdjustment = item.type === "adjustment";
                      const unitLabel =
                        unitOfMeasureLabels[item.unitOfMeasure] ||
                        item.unitOfMeasure;

                      const itemIsWeightOrVolume =
                        item.unitOfMeasure === "KG" ||
                        item.unitOfMeasure === "LT" ||
                        item.unitOfMeasure === "MT";

                      let measureLabel = "Medida";
                      if (itemIsWeightOrVolume) {
                        if (item.unitOfMeasure === "KG") {
                          measureLabel = "Peso (kg)";
                        } else if (item.unitOfMeasure === "LT") {
                          measureLabel = "Volumen (lt)";
                        } else if (item.unitOfMeasure === "MT") {
                          measureLabel = "Longitud (m)";
                        }
                      }

                      let measureValue: number | undefined;
                      if (itemIsWeightOrVolume) {
                        if (item.unitOfMeasure === "KG") {
                          measureValue = item.totalWeightKg ?? undefined;
                        } else {
                          measureValue = item.unitQuantity ?? undefined;
                        }
                      }

                      if (isAdjustment) {
                        const subtotal = calculateItemTotals(item).subtotal;
                        return (
                          <div
                            className="grid gap-3 bg-amber-50/60 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_140px_120px_auto] sm:items-center"
                            key={item.id}
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 text-amber-600 text-xs">
                                <PlusMinus className="h-4 w-4" />
                                Ajuste manual
                              </div>
                              <Input
                                className="h-8"
                                onChange={(event) =>
                                  handleAdjustmentNameChange(
                                    item.id,
                                    event.target.value
                                  )
                                }
                                placeholder="Descripción del ajuste"
                                value={item.name}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground text-xs">
                                Monto
                              </span>
                              <Input
                                className="h-8 w-full"
                                inputMode="decimal"
                                onChange={(event) =>
                                  handleUnitPriceInputChange(
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
                            <div className="flex items-center justify-between sm:justify-end">
                              <div className="flex flex-col items-start gap-1 sm:items-end">
                                <span className="text-muted-foreground text-xs">
                                  Subtotal
                                </span>
                                <p
                                  className={cn(
                                    "font-medium",
                                    subtotal < 0 ? "text-destructive" : ""
                                  )}
                                >
                                  {formatCurrency(subtotal)}
                                </p>
                              </div>
                              <Button
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
                      }

                      return (
                        <div
                          className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_80px_100px_100px_80px_120px_auto] sm:items-center"
                          key={item.id}
                        >
                          {/*
                        Layout:
                        - Product info
                        - Quantity input
                        - Measure (kg/lt/m)
                        - Unit price input
                        - Discount input
                        - Subtotal
                        - Remove action
                      */}
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
                              SKU {item.sku}
                            </p>
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Cantidad
                            </span>
                            <Input
                              className="h-8 w-full"
                              inputMode="decimal"
                              min={0}
                              onChange={(event) =>
                                handleQuantityInputChange(
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

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Precio unitario
                            </span>
                            <Input
                              className="h-8 w-full"
                              inputMode="decimal"
                              min={0}
                              onChange={(event) =>
                                handleUnitPriceInputChange(
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

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Descuento %
                            </span>
                            <Input
                              className="h-8 w-full"
                              inputMode="decimal"
                              max={100}
                              min={0}
                              onChange={(event) =>
                                handleDiscountInputChange(
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

                          <div className="flex flex-col items-start gap-1 sm:items-end">
                            <span className="text-muted-foreground text-xs">
                              Subtotal
                            </span>
                            <p className="font-medium">
                              {formatCurrency(
                                calculateItemTotals(item).subtotal
                              )}
                            </p>
                          </div>

                          <div className="flex items-center justify-start sm:justify-end">
                            <Button
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
                <CardTitle className="text-lg">
                  Resumen de venta directa
                </CardTitle>
                <CardDescription>
                  Totales y detalle para cerrar la operación al instante.
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
                  {totals.adjustmentsTotal !== 0 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Ajustes manuales
                      </span>
                      <span
                        className={cn(
                          totals.adjustmentsTotal < 0 ? "text-destructive" : ""
                        )}
                      >
                        {formatCurrency(totals.adjustmentsTotal)}
                      </span>
                    </div>
                  ) : null}
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
                    Cobro inmediato ({formatDateOnly(dueDate)})
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
                        Registrar venta directa
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
                <CardDescription>
                  Aplica un descuento global sobre subtotal e impuestos.
                </CardDescription>
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
                    -{formatCurrency(totals.totalDiscountAmount)}
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
