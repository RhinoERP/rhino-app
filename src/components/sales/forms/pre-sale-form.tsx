"use client";

import { CalendarIcon, FloppyDiskIcon, PlusMinus } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  FileText,
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
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getAssignmentsByCustomerAction } from "@/modules/customer-supplier-assignments/actions/get-assignments-by-customer.action";
import type { CustomerSupplierAssignment } from "@/modules/customer-supplier-assignments/types";
import type { Customer } from "@/modules/customers/types";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";
import { getPriceListItemsBatchAction } from "@/modules/price-lists/actions/get-price-list-items-batch.action";
import type { PriceListItemBasic } from "@/modules/price-lists/service/price-lists.service";
import { usePreSaleMutation } from "@/modules/sales/hooks/use-pre-sale-mutation";
import type {
  InvoiceType,
  SaleItemType,
  SaleProduct,
} from "@/modules/sales/types";
import {
  addDays,
  computeDueDate,
  toDateOnlyString,
} from "@/modules/sales/utils/date";
import {
  convertToBaseUnits,
  getAvailableUnits,
  getPricePerKg,
  getUnitLabel,
  type InputUnit,
} from "@/modules/sales/utils/sale-calculations";
import { useSalesPriceLists } from "@/modules/sales-price-lists/hooks/use-sales-price-lists";
import type { SalesPriceListType } from "@/modules/sales-price-lists/types";
import type { Tax } from "@/modules/taxes/types";

type PreSaleFormProps = {
  orgSlug: string;
  organization: {
    name: string;
    cuit: string | null;
  };
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

const buildBudgetItem = (
  item: ItemState,
  calculateItemTotals: (entry: ItemState) => { subtotal: number }
) => ({
  sku: item.sku,
  name: item.name,
  brand: item.type === "adjustment" ? null : item.brand || null,
  quantity: item.type === "adjustment" ? 1 : item.quantity,
  unitOfMeasure:
    item.type === "adjustment"
      ? "ajuste"
      : unitOfMeasureLabels[item.unitOfMeasure] || item.unitOfMeasure,
  weightQuantity:
    item.type === "adjustment" ? null : item.totalWeightKg || null,
  unitPrice: item.unitPrice,
  subtotal: calculateItemTotals(item).subtotal,
  discountPercentage:
    item.type === "adjustment" ? null : item.discountPercent || null,
});

const buildBudgetItems = (
  items: ItemState[],
  calculateItemTotals: (item: ItemState) => { subtotal: number }
) => items.map((item) => buildBudgetItem(item, calculateItemTotals));

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

const invoiceTypeOptions: { value: InvoiceType; label: string }[] = [
  { value: "NOTA_DE_VENTA", label: "Nota de venta" },
  { value: "FACTURA_A", label: "Factura A" },
  { value: "FACTURA_B", label: "Factura B" },
  { value: "FACTURA_C", label: "Factura C" },
  { value: "FACTURA_E", label: "Factura E" },
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

const formatStockQuantity = (value: number): string =>
  value.toLocaleString("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

const formatProductStock = (product: SaleProduct): string => {
  const totalQuantity = product.totalQuantity ?? 0;
  const unitLabel = unitOfMeasureLabels[product.unitOfMeasure];

  if (product.tracksStockUnits && product.totalUnitQuantity !== null) {
    return `Stock ${formatStockQuantity(product.totalUnitQuantity)} un. · ${formatStockQuantity(totalQuantity)} ${unitLabel}`;
  }

  return `Stock ${formatStockQuantity(totalQuantity)} ${unitLabel}`;
};

const getModifierKey = (): string => {
  if (typeof window !== "undefined") {
    return navigator.platform.toUpperCase().includes("MAC") ? "⌘" : "Ctrl";
  }
  return "Ctrl";
};

type PriceListAssignment = { type: SalesPriceListType; value: number };

function applyPriceListAssignment(
  basePrice: number,
  assignment: PriceListAssignment | null
): number {
  if (!assignment) {
    return basePrice;
  }
  if (assignment.type === "PRICE") {
    return Math.max(0, basePrice + assignment.value);
  }
  return basePrice * (1 + assignment.value / 100);
}

function buildProductPriceMap(
  products: SaleProduct[],
  supplierPriceMap: Map<string, PriceListAssignment>,
  supplierPriceListItems: Map<string, Map<string, PriceListItemBasic>>,
  fallback: PriceListAssignment | null
): Map<string, number> {
  const priceMap = new Map<string, number>();
  for (const product of products) {
    // Use the cost from the client's assigned purchase price list if available,
    // otherwise fall back to the pre-calculated price from the DB view.
    let basePrice = product.price;
    if (product.supplierId != null) {
      const item = supplierPriceListItems
        .get(product.supplierId)
        ?.get(product.id);
      if (item) {
        basePrice =
          item.margin != null
            ? truncateMoney(item.costPrice * (1 + item.margin / 100))
            : item.costPrice;
      }
    }

    const assignment =
      product.supplierId != null && supplierPriceMap.has(product.supplierId)
        ? (supplierPriceMap.get(product.supplierId) as PriceListAssignment)
        : fallback;

    priceMap.set(product.id, applyPriceListAssignment(basePrice, assignment));
  }
  return priceMap;
}

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
export function PreSaleForm({
  orgSlug,
  organization,
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
  const [customerAssignments, setCustomerAssignments] = useState<
    CustomerSupplierAssignment[]
  >([]);
  const [supplierPriceListItems, setSupplierPriceListItems] = useState<
    Map<string, Map<string, PriceListItemBasic>>
  >(new Map());
  const [inputUnit, setInputUnit] = useState<InputUnit>("UNITS");
  const [saleDate, setSaleDate] = useState<Date>(new Date());
  const [expirationDays, setExpirationDays] = useState<number | null>(null);
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("NOTA_DE_VENTA");
  const [observations, setObservations] = useState<string>("");

  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(0);
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
  const [didInitializeFavoriteTaxes, setDidInitializeFavoriteTaxes] =
    useState(false);
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState<number>(0);

  const [items, setItems] = useState<ItemState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
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

  const { data: salesPriceLists = [] } = useSalesPriceLists(orgSlug);
  const { data: orgSettings } = useOrgSettings(orgSlug);
  const featureEnabled = orgSettings?.configurable_price_lists_enabled ?? false;

  useEffect(() => {
    if (!orgSettings?.due_days_enabled) {
      return;
    }
    const customer = customers.find((c) => c.id === customerId);
    const days =
      typeof customer?.due_days === "number"
        ? customer.due_days
        : (orgSettings.due_days_default ?? null);
    if (days !== null) {
      setExpirationDays(days);
    }
  }, [customerId, orgSettings, customers]);

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

  // Per-supplier price list map derived from customer assignments (only when feature enabled)
  const supplierPriceMap = useMemo(() => {
    const map = new Map<string, PriceListAssignment>();
    for (const assignment of customerAssignments) {
      if (!assignment.sales_price_list_id) {
        continue;
      }
      const priceList = salesPriceLists.find(
        (pl) => pl.id === assignment.sales_price_list_id
      );
      if (priceList) {
        // No is_active / valid_from filter — explicit assignment always overrides
        map.set(assignment.supplier_id, {
          type: priceList.type,
          value: priceList.value,
        });
      }
    }
    return map;
  }, [customerAssignments, salesPriceLists]);

  // Fetch assignments + purchase price list items when customer changes
  useEffect(() => {
    setCustomerAssignments([]);
    setSupplierPriceListItems(new Map());
    if (!(customerId && featureEnabled)) {
      return;
    }

    let cancelled = false;

    getAssignmentsByCustomerAction(orgSlug, customerId)
      .then((fetched) => {
        if (cancelled) {
          return;
        }
        setCustomerAssignments(fetched);

        const priceListIds = fetched
          .map((a) => a.price_list_id)
          .filter((id): id is string => id != null);

        if (priceListIds.length === 0) {
          return;
        }

        getPriceListItemsBatchAction(orgSlug, priceListIds)
          .then((itemsByListId) => {
            if (cancelled) {
              return;
            }
            const supplierMap = new Map<
              string,
              Map<string, PriceListItemBasic>
            >();
            for (const row of fetched) {
              if (!row.price_list_id) {
                continue;
              }
              const listItems = itemsByListId[row.price_list_id] ?? [];
              supplierMap.set(
                row.supplier_id,
                new Map(listItems.map((it) => [it.productId, it]))
              );
            }
            setSupplierPriceListItems(supplierMap);
          })
          .catch(() => {
            if (!cancelled) {
              setSupplierPriceListItems(new Map());
            }
          });
      })
      .catch(() => {
        if (!cancelled) {
          setCustomerAssignments([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orgSlug, customerId, featureEnabled]);

  // Calculate product prices when customer or price list changes
  useEffect(() => {
    if (products.length === 0) {
      setProductPrices(new Map());
      return;
    }

    setIsLoadingPrices(true);
    try {
      // If the customer has an explicitly-assigned price list, use it regardless of
      // is_active or valid_from — same principle as supplier assignments.
      const fallback: PriceListAssignment | null =
        selectedCustomer?.sales_price_list_id && customerPriceList
          ? { type: customerPriceList.type, value: customerPriceList.value }
          : null;

      setProductPrices(
        buildProductPriceMap(
          products,
          supplierPriceMap,
          supplierPriceListItems,
          fallback
        )
      );
    } catch (priceError) {
      console.error("Error calculating product prices:", priceError);
      // Fallback to base prices
      const fallbackMap = new Map(products.map((p) => [p.id, p.price]));
      setProductPrices(fallbackMap);
    } finally {
      setIsLoadingPrices(false);
    }
  }, [
    products,
    selectedCustomer,
    customerPriceList,
    supplierPriceMap,
    supplierPriceListItems,
  ]);

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

  useEffect(() => {
    if (didInitializeFavoriteTaxes || taxes.length === 0) {
      return;
    }

    const favoriteSalesTaxId =
      taxes.find((tax) => Boolean(tax.is_favorite_sales))?.id ?? null;

    if (favoriteSalesTaxId) {
      setSelectedTaxIds([favoriteSalesTaxId]);
    }

    setDidInitializeFavoriteTaxes(true);
  }, [didInitializeFavoriteTaxes, taxes]);

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
  const normalizedExpirationDays =
    typeof expirationDays === "number" && !Number.isNaN(expirationDays)
      ? expirationDays
      : null;
  const expirationDateString = useMemo(() => {
    if (normalizedExpirationDays !== null) {
      const today = toDateOnlyString(new Date());
      return addDays(today, normalizedExpirationDays);
    }
    return null;
  }, [normalizedExpirationDays]);

  const dueDate = useMemo(
    () =>
      computeDueDate(
        saleDateString,
        expirationDateString || null,
        normalizedExpirationDays
      ),
    [saleDateString, expirationDateString, normalizedExpirationDays]
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
    setSelectedQuantity(0);
    setInputUnit("UNITS");
    setError(null);
  };

  const handleAddAdjustment = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `adjustment-${Date.now()}`;

    setItems((prev) => [
      ...prev,
      {
        id,
        type: "adjustment",
        productId: null,
        description: "Ajuste manual",
        name: "Ajuste manual",
        sku: "AJUSTE",
        brand: null,
        quantity: 1,
        unitQuantity: 1,
        unitPrice: 0,
        basePrice: 0,
        unitOfMeasure: "UN",
        tracksStockUnits: false,
        averageQuantityPerUnit: null,
        weightPerUnit: null,
        totalWeightKg: null,
        pricePerKg: undefined,
        discountPercent: 0,
      },
    ]);
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
        creditDays: normalizedExpirationDays,
        invoiceType,
        observations: observations || null,
        items: items.map((item) =>
          buildPreSaleItemPayload(item, calculateItemTotals)
        ),
        globalDiscountPercentage: Math.min(
          Math.max(0, globalDiscountPercent),
          100
        ),
        globalDiscountAmount: totals.globalDiscountAmount,
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

  const handleGenerateBudget = async () => {
    if (!selectedCustomer || items.length === 0) {
      setError(
        "Selecciona un cliente y agrega productos para generar el presupuesto"
      );
      return;
    }

    setIsGeneratingPDF(true);
    setError(null);

    try {
      // Import the generator and PDF functions dynamically
      const [{ generatePreSaleBudgetHTML }, { generatePDFFromHTML }] =
        await Promise.all([
          import("@/modules/sales/service/budget-generator.service"),
          import("@/lib/pdf-generator"),
        ]);

      const budgetData = {
        issuer: {
          businessName: organization.name,
          cuit: organization.cuit,
        },
        date: saleDateString,
        expirationDate: expirationDateString || null,
        customer: {
          businessName: selectedCustomer.business_name,
          fantasyName: selectedCustomer.fantasy_name || null,
          cuit: selectedCustomer.cuit || null,
          phone: selectedCustomer.phone || null,
          address: [selectedCustomer.address, selectedCustomer.city]
            .filter(Boolean)
            .join(", "),
          taxCondition: selectedCustomer.tax_condition || null,
        },
        seller: {
          name: selectedSeller?.label || "Sin asignar",
          email:
            sellers.find((member) => member.user_id === sellerId)?.user
              ?.email ?? undefined,
        },
        items: buildBudgetItems(items, calculateItemTotals),
        subtotal: totals.subtotal,
        taxesTotal: totals.totalTaxAmount,
        discountTotal: totals.globalDiscountAmount,
        total: totals.total,
        observations: observations || null,
      };

      const html = generatePreSaleBudgetHTML(budgetData);

      // Generate PDF
      const customerName =
        selectedCustomer.fantasy_name || selectedCustomer.business_name;
      const filename = `presupuesto-${customerName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      await generatePDFFromHTML(html, filename);

      setSuccessMessage("Presupuesto generado exitosamente");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Error generating budget:", err);
      setError("Error al generar el presupuesto");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/org/${orgSlug}/ventas?estado=DRAFT`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver a Preventas
          </Button>
        </Link>
        <Button
          disabled={!selectedCustomer || items.length === 0 || isGeneratingPDF}
          onClick={handleGenerateBudget}
          size="sm"
          type="button"
          variant="outline"
        >
          <FileText className="mr-2 h-4 w-4" />
          {isGeneratingPDF ? "Generando..." : "Generar Presupuesto"}
        </Button>
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
                      className="w-[320px] max-w-[90vw] p-0"
                      sideOffset={8}
                    >
                      <Command>
                        <CommandInput placeholder="Buscar cliente..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {customers.map((customer) => {
                              const primaryLabel =
                                customer.fantasy_name ||
                                customer.business_name ||
                                "Cliente sin nombre";
                              const businessName =
                                customer.business_name?.trim() ?? "";
                              const city = customer.city?.trim() ?? "";
                              const address = customer.address?.trim() ?? "";
                              const metadataParts = [
                                businessName &&
                                businessName !== primaryLabel &&
                                businessName !== "Cliente sin nombre"
                                  ? businessName
                                  : "",
                                city,
                                address,
                              ].filter(Boolean);
                              const metadataLabel =
                                metadataParts.join(" · ") || "Sin ubicación";
                              const searchTerms = normalizeSearchValue(
                                [
                                  primaryLabel,
                                  customer.fantasy_name ?? "",
                                  customer.business_name ?? "",
                                  customer.city ?? "",
                                  customer.address ?? "",
                                ].join(" ")
                              );

                              return (
                                <CommandItem
                                  className="items-start"
                                  key={customer.id}
                                  onSelect={() =>
                                    handleCustomerSelect(customer.id)
                                  }
                                  value={searchTerms}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium">
                                      {primaryLabel}
                                    </p>
                                    <p className="truncate text-muted-foreground text-xs">
                                      {metadataLabel}
                                    </p>
                                  </div>
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
                                keywords={[seller.label]}
                                onSelect={() => handleSellerSelect(seller.id)}
                                value={seller.id}
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
                  <Label htmlFor="expirationDays">Fecha de vencimiento</Label>
                  <Input
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
                        className="w-full justify-between px-2 py-6 text-left font-normal"
                        id="product"
                        role="combobox"
                        variant="outline"
                      >
                        {selectedProduct ? (
                          <div className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-medium">
                                {selectedProduct.name}
                              </span>
                              {(selectedProduct.totalQuantity === null ||
                                selectedProduct.totalQuantity <= 0) && (
                                <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 font-semibold text-[10px] text-amber-700">
                                  Sin stock
                                </span>
                              )}
                            </div>
                            <span className="truncate text-muted-foreground text-xs">
                              SKU {selectedProduct.sku} ·{" "}
                              {formatPriceByMeasure(
                                productPrices.get(selectedProduct.id) ??
                                  selectedProduct.price,
                                selectedProduct.unitOfMeasure
                              )}
                            </span>
                            <span className="truncate text-muted-foreground text-xs">
                              {formatProductStock(selectedProduct)}
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
                                    keywords={[product.name, product.sku]}
                                    onSelect={() => {
                                      setSelectedProductId(product.id);
                                      setIsProductPickerOpen(false);
                                    }}
                                    value={product.id}
                                  >
                                    <div className="flex w-full items-start gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
                                          <p className="min-w-0 flex-1 whitespace-normal break-words font-medium leading-snug">
                                            {product.name}
                                          </p>
                                          {(product.totalQuantity === null ||
                                            product.totalQuantity <= 0) && (
                                            <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 font-semibold text-[10px] text-amber-700">
                                              Sin stock
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-muted-foreground text-xs">
                                          SKU {product.sku} ·{" "}
                                          {formatPriceByMeasure(
                                            adjustedPrice,
                                            product.unitOfMeasure
                                          )}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                          {formatProductStock(product)}
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
                      placeholder="0"
                      step="0.01"
                      type="number"
                      value={
                        !selectedQuantity || Number.isNaN(selectedQuantity)
                          ? ""
                          : selectedQuantity
                      }
                    />
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-shrink-0">
                    <Button
                      className="w-full whitespace-nowrap"
                      onClick={handleAddAdjustment}
                      type="button"
                      variant="outline"
                    >
                      <PlusMinus className="mr-2 h-4 w-4" />
                      Agregar ajuste manual
                    </Button>
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
                        preventa.
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
                                placeholder="0"
                                step="0.01"
                                type="number"
                                value={
                                  !item.unitPrice ||
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
                              placeholder="0"
                              step="0.01"
                              type="number"
                              value={
                                !item.quantity || Number.isNaN(item.quantity)
                                  ? ""
                                  : item.quantity
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
                              placeholder="0"
                              step="0.01"
                              type="number"
                              value={
                                !item.unitPrice || Number.isNaN(item.unitPrice)
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
                <CardDescription>
                  Aplica un descuento global sobre subtotal antes de impuestos.
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
