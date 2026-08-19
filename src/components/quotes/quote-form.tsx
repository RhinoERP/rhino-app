"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileImage, FilePdf, Info, PencilSimple } from "@phosphor-icons/react";
import {
  Check,
  ChevronsUpDown,
  CloudUpload,
  MoreHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { usePermissions } from "@/components/auth/permissions-provider";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Customer } from "@/modules/customers/types";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";
import {
  type QuoteFormValues,
  type QuoteItemFormValues,
  type QuoteItemVariantFormValues,
  quoteFormSchema,
} from "@/modules/quotes/types";
import {
  buildQuoteTaxLines,
  computeQuoteTotals,
} from "@/modules/quotes/utils/quote-line-calcs";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";
import { useTaxes } from "@/modules/taxes/hooks/use-taxes";
import {
  type ItemTaxInput,
  toFallbackItemTaxes,
} from "@/modules/taxes/item-tax-calculations";
import type { Tax } from "@/modules/taxes/types";
import { ProductSearch } from "./product-search";
import { ProductVariantsGridDialog } from "./product-variants-grid-dialog";
import { QuoteItemExtrasPopover } from "./quote-item-extras-popover";

const NO_PRICE_LIST = "none";

async function fetchBlueRate(): Promise<number> {
  const res = await fetch("/api/exchange-rate/blue");
  if (!res.ok) {
    throw new Error("Error al obtener la cotización");
  }
  const data = (await res.json()) as { venta: number };
  return data.venta;
}

function convertItemsToCurrency(
  items: QuoteFormValues["items"],
  rate: number,
  divide: boolean
): QuoteFormValues["items"] {
  return items.map((item) => ({
    ...item,
    unitPrice: divide
      ? truncateMoney(item.unitPrice / rate)
      : truncateMoney(item.unitPrice * rate),
    subtotal: divide
      ? truncateMoney(item.subtotal / rate)
      : truncateMoney(item.subtotal * rate),
  }));
}

function getDisplayName(
  file: File | null | undefined,
  url: string | null | undefined,
  label: string
): string | null {
  if (file) {
    return file.name;
  }
  if (url) {
    return label;
  }
  return null;
}

function getEffectivePriceList(
  form: { getValues: (name: string) => string },
  salesPriceLists: SalesPriceList[]
): SalesPriceList | undefined {
  const targetMarginListId = form.getValues("targetMarginListId");
  if (targetMarginListId && targetMarginListId !== "none") {
    const targetList = salesPriceLists.find(
      (pl) => pl.id === targetMarginListId
    );
    if (targetList) {
      return targetList;
    }
  }
  const salesPriceListId = form.getValues("salesPriceListId");
  return salesPriceLists.find((pl) => pl.id === salesPriceListId);
}

function recalcItemPrices(
  items: QuoteFormValues["items"],
  products: SaleProduct[],
  priceList: SalesPriceList | undefined,
  adjustFn: (
    basePrice: number,
    costPrice: number | null | undefined,
    pl: SalesPriceList | null | undefined
  ) => number
): QuoteFormValues["items"] {
  return items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const newUnitPrice = adjustFn(
      product?.price ?? 0,
      product?.costPrice,
      priceList
    );
    const extrasTotal = (item.extras || []).reduce(
      (acc, e) => acc + e.price,
      0
    );
    return {
      ...item,
      unitPrice: newUnitPrice,
      subtotal: truncateMoney(
        (newUnitPrice + extrasTotal) * item.totalQuantity
      ),
    };
  });
}

function hasItemVariants(item: QuoteFormValues["items"][number]): boolean {
  return (
    item.variants.length > 1 ||
    (item.variants.length === 1 &&
      (item.variants[0].talle !== "Único" || item.variants[0].color !== "—"))
  );
}

const formatTaxSummary = (
  taxes: Array<{ name: string; rate: number }>
): string => taxes.map((tax) => `${tax.name} (${tax.rate}%)`).join(", ");

const isIvaItemTax = (tax: ItemTaxInput) =>
  tax.taxCodeSnapshot?.trim().toUpperCase().startsWith("IVA_") ?? false;

const isIvaTax = (tax: Tax) =>
  tax.code?.trim().toUpperCase().startsWith("IVA_") ?? false;

const toManualItemTax = (tax: Tax): ItemTaxInput => ({
  taxId: tax.id,
  name: tax.name,
  rate: tax.rate,
  taxCodeSnapshot: tax.code ?? null,
  source: "manual",
});

const getItemTaxIndicator = (
  item: QuoteItemFormValues,
  fallbackTaxes: Tax[]
): {
  label: string;
  summary: string;
  variant: "product" | "manual" | "fallback" | "none";
} => {
  if (item.taxes && item.taxes.length > 0) {
    const isManualOverride = item.taxes.some((tax) => tax.source === "manual");

    return {
      label: isManualOverride ? "Impuesto línea" : "Impuesto producto",
      summary: formatTaxSummary(item.taxes),
      variant: isManualOverride ? "manual" : "product",
    };
  }

  if (fallbackTaxes.length > 0) {
    return {
      label: "Impuesto venta",
      summary: formatTaxSummary(fallbackTaxes),
      variant: "fallback",
    };
  }

  return {
    label: "Sin impuesto",
    summary: "",
    variant: "none",
  };
};

const clampPercentage = (value: number): number =>
  Math.min(Math.max(0, value), 100);

function ProductInfoCell({ item }: { item: QuoteFormValues["items"][number] }) {
  return (
    <TableCell>
      <div className="font-medium">{item.productName}</div>
      {item.sku && (
        <div className="text-muted-foreground text-xs">
          {item.sku}
          {item.brand ? ` · ${item.brand}` : ""}
        </div>
      )}
    </TableCell>
  );
}

function UnitPriceInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (raw: string) => void;
}) {
  const [draft, setDraft] = useState(value.toString());
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraft(value.toString());
    }
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onChange(draft);
    } else {
      setDraft(value.toString());
    }
  };

  return (
    <Input
      className="h-8 w-full min-w-[80px] text-right"
      inputMode="decimal"
      onBlur={() => {
        isFocusedRef.current = false;
        commit();
      }}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
          event.currentTarget.blur();
        }
      }}
      value={draft}
    />
  );
}

type TargetMarginListSelectProps = {
  // biome-ignore lint/suspicious/noExplicitAny: react-hook-form control type is opaque
  control: any;
  targetMarginLists: SalesPriceList[];
  NO_PRICE_LIST: string;
};

function TargetMarginListSelect({
  control,
  targetMarginLists,
  NO_PRICE_LIST: noneValue,
}: TargetMarginListSelectProps) {
  if (targetMarginLists.length === 0) {
    return null;
  }

  return (
    <FormField
      control={control}
      name="targetMarginListId"
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center gap-1.5">
            <FormLabel>Margen objetivo (opcional)</FormLabel>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-muted-foreground">
                  <Info weight="fill" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Solo listas de margen sobre costo. Reemplaza la lista del
                cliente para este presupuesto.
              </TooltipContent>
            </Tooltip>
          </div>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Ninguna" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={noneValue}>Ninguna</SelectItem>
              {targetMarginLists.map((pl) => (
                <SelectItem key={pl.id} value={pl.id}>
                  {pl.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

type QuoteFormProps = {
  orgSlug: string;
  customers: Customer[];
  products: SaleProduct[];
  salesPriceLists: SalesPriceList[];
  onSubmit: (values: QuoteFormValues) => void;
  isSubmitting?: boolean;
  defaultValues?: Partial<QuoteFormValues>;
  submitLabel?: string;
  selectedFile?: File | null;
  onFileSelect?: (file: File | null) => void;
  selectedDesignFile?: File | null;
  onDesignFileSelect?: (file: File | null) => void;
  onCancel?: () => void;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI form composition requires several hooks and handlers
export function QuoteForm({
  orgSlug,
  salesPriceLists,
  customers,
  products,
  onSubmit,
  isSubmitting,
  defaultValues,
  submitLabel = "Guardar Presupuesto",
  selectedFile,
  onFileSelect,
  selectedDesignFile,
  onDesignFileSelect,
  onCancel,
}: QuoteFormProps) {
  const [selectedProduct, setSelectedProduct] = useState<SaleProduct | null>(
    null
  );
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingInitialQuantities, setEditingInitialQuantities] = useState<
    Record<string, Record<string, number>>
  >({});
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [convertingCurrency, setConvertingCurrency] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const designFileInputRef = useRef<HTMLInputElement>(null);
  const [isTaxesPickerOpen, setIsTaxesPickerOpen] = useState(false);
  const [openItemTaxPickerId, setOpenItemTaxPickerId] = useState<string | null>(
    null
  );
  const [didInitializeFavoriteTaxes, setDidInitializeFavoriteTaxes] =
    useState(false);

  const { can } = usePermissions();
  const canEditPrices = can("organization.admin");

  const { data: taxes = [] } = useTaxes(orgSlug);
  const { data: orgSettings } = useOrgSettings(orgSlug);

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      customerId: "",
      salesPriceListId: NO_PRICE_LIST,
      targetMarginListId: NO_PRICE_LIST,
      currency: "ARS",
      items: [],
      notes: "",
      paymentCondition: "",
      globalDiscountPercentage: 0,
      taxes: [],
      ...defaultValues,
    } as QuoteFormValues,
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const formFallbackTaxes =
    useWatch({ control: form.control, name: "taxes" }) ?? [];

  const selectedTaxes = useMemo(
    () =>
      taxes
        .filter((tax) =>
          formFallbackTaxes.some((itemTax) => itemTax.taxId === tax.id)
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [formFallbackTaxes, taxes]
  );

  useEffect(() => {
    if (didInitializeFavoriteTaxes || taxes.length === 0) {
      return;
    }

    const currentFallback = form.getValues("taxes");
    if (currentFallback && currentFallback.length > 0) {
      setDidInitializeFavoriteTaxes(true);
      return;
    }

    const settingsTaxIds = orgSettings?.sales_default_tax_ids ?? [];
    const validSettingsTaxIds = settingsTaxIds.filter((taxId) =>
      taxes.some((tax) => tax.id === taxId)
    );

    const toFallbackInputs = (taxIds: string[]): ItemTaxInput[] =>
      toFallbackItemTaxes(
        taxIds.map((id) => {
          const tax = taxes.find((t) => t.id === id);
          return {
            taxId: id,
            name: tax?.name ?? id,
            rate: tax?.rate ?? 0,
            taxCodeSnapshot: tax?.code ?? null,
          };
        })
      );

    if (validSettingsTaxIds.length > 0) {
      form.setValue("taxes", toFallbackInputs(validSettingsTaxIds), {
        shouldDirty: false,
      });
      setDidInitializeFavoriteTaxes(true);
      return;
    }

    const favoriteSalesTaxIds = taxes
      .filter((tax) => Boolean(tax.is_favorite_sales))
      .map((tax) => tax.id);

    if (favoriteSalesTaxIds.length > 0) {
      form.setValue("taxes", toFallbackInputs(favoriteSalesTaxIds), {
        shouldDirty: false,
      });
    }

    setDidInitializeFavoriteTaxes(true);
  }, [
    didInitializeFavoriteTaxes,
    taxes,
    orgSettings?.sales_default_tax_ids,
    form,
  ]);

  const handleTaxToggle = (taxId: string) => {
    const current = form.getValues("taxes") ?? [];
    const isSelected = current.some((itemTax) => itemTax.taxId === taxId);
    const tax = taxes.find((t) => t.id === taxId);

    const next = isSelected
      ? current.filter((itemTax) => itemTax.taxId !== taxId)
      : [
          ...current,
          {
            taxId,
            name: tax?.name ?? "",
            rate: tax?.rate ?? 0,
            taxCodeSnapshot: tax?.code ?? null,
            source: "fallback" as const,
          },
        ];

    form.setValue("taxes", next, { shouldDirty: true });
  };

  const handleUseSaleTaxesForItem = (index: number) => {
    const currentItems = form.getValues("items");
    const item = currentItems[index];
    update(index, {
      ...item,
      taxes: [],
    });
  };

  const handleItemTaxToggle = (index: number, tax: Tax) => {
    const currentItems = form.getValues("items");
    const item = currentItems[index];
    const currentTaxes = item.taxes ?? [];
    const isSelected = currentTaxes.some((itemTax) => itemTax.taxId === tax.id);
    const nextTaxes = isSelected
      ? currentTaxes.filter((itemTax) => itemTax.taxId !== tax.id)
      : [
          ...(isIvaTax(tax)
            ? currentTaxes.filter((itemTax) => !isIvaItemTax(itemTax))
            : currentTaxes),
          toManualItemTax(tax),
        ];

    update(index, {
      ...item,
      taxes: nextTaxes,
    });
  };

  const handleProductSelect = (product: SaleProduct, quantity = 1) => {
    setSelectedProduct(product);
    if (product.hasVariants) {
      setIsGridOpen(true);
      return;
    }
    const unitPrice = getUnitPrice(product);
    const currentItems = form.getValues("items");
    const existingIndex = currentItems.findIndex(
      (i) => i.productId === product.id
    );

    if (existingIndex >= 0) {
      const existingItem = currentItems[existingIndex];
      const updatedVariants = existingItem.variants.map((v) => ({
        ...v,
        quantity: v.quantity + quantity,
      }));
      const extrasTotal = (existingItem.extras || []).reduce(
        (acc, e) => acc + e.price,
        0
      );
      update(existingIndex, {
        ...existingItem,
        variants: updatedVariants,
        totalQuantity: existingItem.totalQuantity + quantity,
        subtotal: truncateMoney(
          (unitPrice + extrasTotal) * (existingItem.totalQuantity + quantity)
        ),
      });
    } else {
      append({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        brand: product.brand ?? undefined,
        unitPrice,
        variants: [
          {
            talle: "\u00danico",
            color: "\u2014",
            quantity,
          },
        ],
        totalQuantity: quantity,
        extras: [],
        subtotal: truncateMoney(unitPrice * quantity),
        discountPercentage: 0,
        taxes: product.taxes ?? [],
      });
    }
    setSelectedProduct(null);
  };

  const getAdjustedPrice = useCallback(
    (
      basePrice: number,
      costPrice: number | null | undefined,
      priceList: SalesPriceList | null | undefined
    ): number => {
      if (!priceList?.is_active) {
        return basePrice;
      }

      const today = new Date().toISOString().split("T")[0];
      if (priceList.valid_from > today) {
        return basePrice;
      }

      if (priceList.is_target_margin && costPrice != null) {
        return truncateMoney(costPrice * (1 + priceList.value / 100));
      }

      if (priceList.type === "PRICE") {
        return truncateMoney(Math.max(0, basePrice + priceList.value));
      }

      return truncateMoney(basePrice * (1 + priceList.value / 100));
    },
    []
  );

  const targetMarginLists = useMemo(
    () => salesPriceLists.filter((pl) => pl.is_target_margin),
    [salesPriceLists]
  );

  const getUnitPrice = (product: SaleProduct) => {
    const priceList = getEffectivePriceList(form, salesPriceLists);
    return getAdjustedPrice(product.price || 0, product.costPrice, priceList);
  };

  const applyEditVariants = (variants: QuoteItemVariantFormValues[]) => {
    if (editingItemIndex === null || !selectedProduct) {
      return false;
    }
    const currentItems = form.getValues("items");
    const existingItem = currentItems[editingItemIndex];
    const totalQuantity = variants.reduce((acc, v) => acc + v.quantity, 0);
    const extrasTotal = (existingItem.extras || []).reduce(
      (acc, e) => acc + e.price,
      0
    );
    const unitPrice = getUnitPrice(selectedProduct);
    update(editingItemIndex, {
      ...existingItem,
      variants,
      totalQuantity,
      subtotal: truncateMoney((unitPrice + extrasTotal) * totalQuantity),
    });
    setEditingItemIndex(null);
    setEditingInitialQuantities({});
    return true;
  };

  const appendNewVariants = (
    product: SaleProduct,
    variants: QuoteItemVariantFormValues[]
  ) => {
    const unitPrice = getUnitPrice(product);
    const totalQuantity = variants.reduce((acc, v) => acc + v.quantity, 0);
    const currentItems = form.getValues("items");
    const existingIndex = currentItems.findIndex(
      (i) => i.productId === product.id
    );

    if (existingIndex >= 0) {
      const existingItem = currentItems[existingIndex];
      const mergedVariants = [...existingItem.variants];
      for (const newVar of variants) {
        const existingVarIndex = mergedVariants.findIndex(
          (v) => v.talle === newVar.talle && v.color === newVar.color
        );
        if (existingVarIndex >= 0) {
          mergedVariants[existingVarIndex] = {
            ...mergedVariants[existingVarIndex],
            quantity:
              mergedVariants[existingVarIndex].quantity + newVar.quantity,
          };
        } else {
          mergedVariants.push(newVar);
        }
      }
      const newTotalQuantity = mergedVariants.reduce(
        (acc, v) => acc + v.quantity,
        0
      );
      const extrasTotal = (existingItem.extras || []).reduce(
        (acc, e) => acc + e.price,
        0
      );
      update(existingIndex, {
        ...existingItem,
        variants: mergedVariants,
        totalQuantity: newTotalQuantity,
        subtotal: truncateMoney((unitPrice + extrasTotal) * newTotalQuantity),
      });
    } else {
      append({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        brand: product.brand ?? undefined,
        unitPrice,
        variants,
        totalQuantity,
        extras: [],
        subtotal: truncateMoney(totalQuantity * unitPrice),
        discountPercentage: 0,
        taxes: product.taxes ?? [],
      });
    }
  };

  const handleVariantsConfirm = (variants: QuoteItemVariantFormValues[]) => {
    const product = selectedProduct;
    if (!product) {
      return;
    }

    if (!applyEditVariants(variants)) {
      appendNewVariants(product, variants);
    }

    setSelectedProduct(null);
  };

  const handleEditVariants = (index: number) => {
    const currentItems = form.getValues("items");
    const item = currentItems[index];
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      return;
    }

    const initialQuantities: Record<string, Record<string, number>> = {};
    for (const v of item.variants) {
      if (!initialQuantities[v.color]) {
        initialQuantities[v.color] = {};
      }
      initialQuantities[v.color][v.talle] = v.quantity;
    }

    setSelectedProduct(product);
    setEditingItemIndex(index);
    setEditingInitialQuantities(initialQuantities);
    setIsGridOpen(true);
  };

  const handleQuantityChange = (index: number, newQuantity: number) => {
    if (newQuantity < 1) {
      return;
    }
    const currentItems = form.getValues("items");
    const item = currentItems[index];
    const extrasTotal = (item.extras || []).reduce(
      (acc, e) => acc + e.price,
      0
    );
    update(index, {
      ...item,
      totalQuantity: newQuantity,
      variants: item.variants.map((v) => ({
        ...v,
        quantity: newQuantity,
      })),
      subtotal: truncateMoney((item.unitPrice + extrasTotal) * newQuantity),
    });
  };

  const handleUnitPriceChange = (index: number, rawValue: string) => {
    const parsed = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    const currentItems = form.getValues("items");
    const item = currentItems[index];
    const extrasTotal = (item.extras || []).reduce(
      (acc, e) => acc + e.price,
      0
    );
    update(index, {
      ...item,
      unitPrice: parsed,
      subtotal: truncateMoney((parsed + extrasTotal) * item.totalQuantity),
    });
  };

  const handleDiscountChange = (index: number, rawValue: string) => {
    const parsed = Number.parseFloat(rawValue);
    const pct = Number.isNaN(parsed) ? 0 : clampPercentage(parsed);
    const currentItems = form.getValues("items");
    const item = currentItems[index];
    update(index, {
      ...item,
      discountPercentage: pct,
    });
  };

  const handleGridOpenChange = (open: boolean) => {
    setIsGridOpen(open);
    if (!open) {
      setEditingItemIndex(null);
      setEditingInitialQuantities({});
    }
  };

  const currentFileUrl =
    useWatch({
      control: form.control,
      name: "purchaseOrderFile",
    }) ?? null;

  const currentDesignFileUrl =
    useWatch({
      control: form.control,
      name: "designFile",
    }) ?? null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.type !== "application/pdf") {
      return;
    }
    onFileSelect?.(file);
    form.setValue("purchaseOrderFile", file ? "selected" : null, {
      shouldDirty: true,
    });
    if (e.target) {
      e.target.value = "";
    }
  };

  const handleDesignFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    onDesignFileSelect?.(file);
    form.setValue("designFile", file ? "selected" : null, {
      shouldDirty: true,
    });
    if (e.target) {
      e.target.value = "";
    }
  };

  const handleRemoveFile = () => {
    onFileSelect?.(null);
    form.setValue("purchaseOrderFile", null, { shouldDirty: true });
  };

  const handleRemoveDesignFile = () => {
    onDesignFileSelect?.(null);
    form.setValue("designFile", null, { shouldDirty: true });
  };

  const displayName = getDisplayName(
    selectedFile,
    currentFileUrl,
    "Orden de compra adjunta"
  );

  const designDisplayName = getDisplayName(
    selectedDesignFile,
    currentDesignFileUrl,
    "Boceto adjunto"
  );

  const isDesignImage = selectedDesignFile?.type.startsWith("image/") ?? false;

  const formItems = useWatch({ control: form.control, name: "items" }) ?? [];

  const globalDiscountPercentage = useWatch({
    control: form.control,
    name: "globalDiscountPercentage",
  });

  const totals = useMemo(() => {
    const lines = buildQuoteTaxLines(formItems);
    return computeQuoteTotals({
      items: formItems,
      globalDiscountPercentage: globalDiscountPercentage ?? 0,
      fallbackTaxes: formFallbackTaxes,
      lines,
    });
  }, [formItems, formFallbackTaxes, globalDiscountPercentage]);

  const quoteTotal = totals.totalAmount;
  const advancePaymentPercentage = useWatch({
    control: form.control,
    name: "advancePaymentPercentage",
  });

  const selectedPriceListId = useWatch({
    control: form.control,
    name: "salesPriceListId",
  });

  const selectedTargetMarginListId = useWatch({
    control: form.control,
    name: "targetMarginListId",
  });

  const selectedCustomerId = useWatch({
    control: form.control,
    name: "customerId",
  });

  const currency = useWatch({
    control: form.control,
    name: "currency",
  });

  useEffect(() => {
    if (!selectedCustomerId) {
      return;
    }
    const customer = customers.find((c) => c.id === selectedCustomerId);
    const priceListId = customer?.sales_price_list_id ?? NO_PRICE_LIST;
    form.setValue("salesPriceListId", priceListId);
  }, [selectedCustomerId, customers, form]);

  useEffect(() => {
    if (fields.length === 0) {
      return;
    }

    if (currency === "USD") {
      return;
    }

    const priceList =
      selectedTargetMarginListId && selectedTargetMarginListId !== NO_PRICE_LIST
        ? salesPriceLists.find((pl) => pl.id === selectedTargetMarginListId)
        : salesPriceLists.find((pl) => pl.id === selectedPriceListId);

    const currentItems = form.getValues("items");
    const updatedItems = recalcItemPrices(
      currentItems,
      products,
      priceList,
      getAdjustedPrice
    );

    form.setValue("items", updatedItems, { shouldDirty: true });
  }, [
    selectedPriceListId,
    selectedTargetMarginListId,
    salesPriceLists,
    form,
    products,
    currency,
    fields.length,
    getAdjustedPrice,
  ]);

  const handleConvertCurrency = async () => {
    if (convertingCurrency) {
      return;
    }

    if (currency === "ARS") {
      setConvertingCurrency(true);
      try {
        const rate = await fetchBlueRate();
        setExchangeRate(rate);

        const currentItems = form.getValues("items");
        form.setValue(
          "items",
          convertItemsToCurrency(currentItems, rate, true),
          {
            shouldDirty: true,
          }
        );
        form.setValue("currency", "USD");
        form.setValue("exchangeRate", rate);
      } catch {
        toast.error("No se pudo obtener la cotización del dólar blue");
      } finally {
        setConvertingCurrency(false);
      }
    } else if (exchangeRate) {
      const currentItems = form.getValues("items");
      form.setValue(
        "items",
        convertItemsToCurrency(currentItems, exchangeRate, false),
        { shouldDirty: true }
      );
      form.setValue("currency", "ARS");
      form.setValue("exchangeRate", null);
      setExchangeRate(null);
    }
  };

  useEffect(() => {
    if (defaultValues?.exchangeRate) {
      setExchangeRate(defaultValues.exchangeRate);
    }
  }, [defaultValues?.exchangeRate]);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="flex flex-col gap-6 lg:col-span-8">
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            {/* Detalles principales del presupuesto */}
            <Card>
              <CardHeader>
                <CardTitle>Detalles del Presupuesto</CardTitle>
                <CardDescription>
                  Selecciona el cliente, lista de precios y moneda.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cliente</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccione un cliente" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.business_name || c.fantasy_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="salesPriceListId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lista de Precios</FormLabel>
                        <Select
                          disabled
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Ninguna / Precio base" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NO_PRICE_LIST}>
                              Ninguna / Precio base
                            </SelectItem>
                            {salesPriceLists.map((pl) => (
                              <SelectItem key={pl.id} value={pl.id}>
                                {pl.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <TargetMarginListSelect
                    control={form.control}
                    NO_PRICE_LIST={NO_PRICE_LIST}
                    targetMarginLists={targetMarginLists}
                  />
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Moneda</FormLabel>
                        <FormControl>
                          <input type="hidden" {...field} />
                        </FormControl>
                        <div className="flex h-9 items-center rounded-md border px-3 text-sm">
                          {field.value === "USD"
                            ? "USD - Dólares"
                            : "ARS - Pesos Arg."}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="taxes"
                    render={() => (
                      <FormItem>
                        <FormLabel>Impuestos</FormLabel>
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
                              type="button"
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
                            <p className="border-b px-3 py-2 text-muted-foreground text-xs">
                              Se aplican a los productos sin impuesto propio.
                            </p>
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
                                      {formFallbackTaxes.some(
                                        (itemTax) => itemTax.taxId === tax.id
                                      ) ? (
                                        <Check className="h-4 w-4 shrink-0 text-primary" />
                                      ) : null}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {fields.length > 0 && (
                  <ConvertCurrencySection
                    convertingCurrency={convertingCurrency}
                    currency={currency}
                    exchangeRate={exchangeRate}
                    onConvert={handleConvertCurrency}
                  />
                )}
              </CardContent>
            </Card>

            {/* Pago anticipado y Condiciones */}
            <Card>
              <CardHeader>
                <CardTitle>Condiciones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="advancePaymentEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-col gap-2">
                        <label className="flex cursor-pointer items-center gap-2 font-medium text-sm">
                          <input
                            checked={field.value ?? false}
                            className="size-4 accent-primary"
                            onChange={(e) => {
                              field.onChange(e.target.checked);
                              if (!e.target.checked) {
                                form.setValue("advancePaymentPercentage", null);
                              }
                            }}
                            type="checkbox"
                          />
                          Pago anticipado
                        </label>
                        {(field.value ?? false) && (
                          <FormField
                            control={form.control}
                            name="advancePaymentPercentage"
                            render={({ field: pctField }) => (
                              <FormItem className="pl-6">
                                <FormControl>
                                  <div className="flex w-32 items-center gap-2">
                                    <Input
                                      className="w-20"
                                      max={100}
                                      min={1}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === "") {
                                          pctField.onChange(null);
                                          return;
                                        }
                                        const num = Number(val);
                                        if (
                                          Number.isNaN(num) ||
                                          num < 1 ||
                                          num > 100
                                        ) {
                                          return;
                                        }
                                        pctField.onChange(num);
                                      }}
                                      placeholder="%"
                                      type="number"
                                      value={pctField.value ?? ""}
                                    />
                                    <span className="text-muted-foreground text-sm">
                                      %
                                    </span>
                                  </div>
                                </FormControl>
                                {advancePaymentPercentage ? (
                                  <p className="mt-2 text-muted-foreground text-sm">
                                    Anticipo estimado:{" "}
                                    {formatCurrency(
                                      truncateMoney(
                                        (quoteTotal *
                                          advancePaymentPercentage) /
                                          100
                                      ),
                                      currency
                                    )}
                                    . Se confirmará y podrá editarse al generar
                                    el anticipo.
                                  </p>
                                ) : null}
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="paymentCondition"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-1">
                          <FormLabel>Condiciones</FormLabel>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="inline-flex size-4 items-center justify-center rounded-full border text-muted-foreground text-xs leading-none"
                                type="button"
                              >
                                ?
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              <p className="max-w-[200px] text-xs">
                                En caso de tener condiciones de cobro/pago,
                                dejar asentado por escrito el plazo como
                                referencia
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <FormControl>
                          <Input
                            placeholder="Ej: Pago a 30 días"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Ítems del Presupuesto */}
            <Card>
              <CardHeader>
                <CardTitle>Productos</CardTitle>
                <CardDescription>
                  Agregue los productos y talles al presupuesto.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6">
                  {/* Buscador */}
                  <ProductSearch
                    onSelectProduct={handleProductSelect}
                    priceList={
                      salesPriceLists.find(
                        (pl) => pl.id === selectedPriceListId
                      ) ?? null
                    }
                    products={products}
                  />

                  {/* Tabla de ítems seleccionados */}
                  {fields.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Producto</TableHead>
                            <TableHead>Talles</TableHead>
                            <TableHead className="text-right">
                              Precio Un.
                            </TableHead>
                            <TableHead className="text-right">Extras</TableHead>
                            <TableHead className="text-right">
                              Cantidad
                            </TableHead>
                            <TableHead className="text-right">
                              Desc. %
                            </TableHead>
                            <TableHead className="text-right">
                              Subtotal
                            </TableHead>
                            <TableHead className="w-[50px]" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: render logic for item rows */}
                          {fields.map((field, index) => {
                            const item = formItems[index] || field;
                            const taxIndicator = getItemTaxIndicator(
                              item,
                              selectedTaxes
                            );
                            return (
                              <>
                                <TableRow key={field.id}>
                                  <ProductInfoCell item={item} />
                                  <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      {item.variants.map((v) => (
                                        <span
                                          className="inline-flex items-center rounded-md bg-muted px-2 py-1 font-medium text-xs"
                                          key={`${v.talle}-${v.color}`}
                                        >
                                          {v.talle} / {v.color}: {v.quantity}
                                        </span>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {canEditPrices ? (
                                      <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground text-sm">
                                          $
                                        </span>
                                        <UnitPriceInput
                                          onChange={(raw) =>
                                            handleUnitPriceChange(index, raw)
                                          }
                                          value={item.unitPrice}
                                        />
                                      </div>
                                    ) : (
                                      formatCurrency(item.unitPrice, currency)
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <QuoteItemExtrasPopover
                                      extras={item.extras || []}
                                      onChange={(newExtras) => {
                                        const extrasTotal = newExtras.reduce(
                                          (acc, e) => acc + e.price,
                                          0
                                        );
                                        const newSubtotal = truncateMoney(
                                          (item.unitPrice + extrasTotal) *
                                            item.totalQuantity
                                        );
                                        update(index, {
                                          ...item,
                                          extras: newExtras,
                                          subtotal: newSubtotal,
                                        });
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {hasItemVariants(item) ? (
                                      <span className="font-medium">
                                        {item.totalQuantity}
                                      </span>
                                    ) : (
                                      <Input
                                        className="ml-auto h-8 w-16 text-right"
                                        min={1}
                                        onChange={(e) => {
                                          const val = Number.parseInt(
                                            e.target.value,
                                            10
                                          );
                                          if (!Number.isNaN(val)) {
                                            handleQuantityChange(
                                              index,
                                              Math.max(1, val)
                                            );
                                          }
                                        }}
                                        type="number"
                                        value={item.totalQuantity}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Input
                                      className="ml-auto h-8 w-16 text-right"
                                      inputMode="decimal"
                                      max={100}
                                      min={0}
                                      onChange={(e) =>
                                        handleDiscountChange(
                                          index,
                                          e.target.value
                                        )
                                      }
                                      step="0.01"
                                      type="number"
                                      value={
                                        (item.discountPercentage ?? 0) === 0
                                          ? ""
                                          : (item.discountPercentage ?? 0)
                                      }
                                    />
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(
                                      truncateMoney(
                                        (item.subtotal ?? 0) -
                                          truncateMoney(
                                            ((item.subtotal ?? 0) *
                                              clampPercentage(
                                                item.discountPercentage ?? 0
                                              )) /
                                              100
                                          )
                                      ),
                                      currency
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center justify-end gap-0">
                                      {hasItemVariants(item) && (
                                        <Button
                                          onClick={() =>
                                            handleEditVariants(index)
                                          }
                                          size="icon"
                                          title="Editar variantes"
                                          type="button"
                                          variant="ghost"
                                        >
                                          <PencilSimple className="h-4 w-4" />
                                        </Button>
                                      )}
                                      <Button
                                        onClick={() => remove(index)}
                                        size="icon"
                                        type="button"
                                        variant="ghost"
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                                <TableRow key={`${field.id}-tax`}>
                                  <TableCell
                                    className="border-t-0 py-1 pt-0"
                                    colSpan={8}
                                  >
                                    <div className="flex w-full items-start justify-between gap-3">
                                      <p
                                        className={cn(
                                          "min-w-0 flex-1 text-xs leading-relaxed",
                                          taxIndicator.variant === "product" ||
                                            taxIndicator.variant === "manual"
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                        )}
                                      >
                                        <span className="font-medium">
                                          {taxIndicator.label}
                                        </span>
                                        {taxIndicator.summary
                                          ? `: ${taxIndicator.summary}`
                                          : null}
                                      </p>
                                      <Popover
                                        onOpenChange={(open) =>
                                          setOpenItemTaxPickerId(
                                            open ? field.id : null
                                          )
                                        }
                                        open={openItemTaxPickerId === field.id}
                                      >
                                        <PopoverTrigger asChild>
                                          <Button
                                            aria-label={`Cambiar impuestos de ${item.productName}`}
                                            className="h-7 w-7 shrink-0 text-muted-foreground"
                                            size="icon"
                                            type="button"
                                            variant="ghost"
                                          >
                                            <MoreHorizontal className="h-4 w-4" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          align="end"
                                          className="w-80 p-0"
                                          sideOffset={6}
                                        >
                                          <Command>
                                            <CommandInput placeholder="Buscar impuesto..." />
                                            <CommandList>
                                              <CommandEmpty>
                                                No se encontraron impuestos.
                                              </CommandEmpty>
                                              <CommandGroup>
                                                <CommandItem
                                                  onSelect={() =>
                                                    handleUseSaleTaxesForItem(
                                                      index
                                                    )
                                                  }
                                                  value={`default-${field.id}`}
                                                >
                                                  <span className="flex-1 truncate">
                                                    Usar impuesto de venta
                                                  </span>
                                                  {item.taxes?.length === 0 ? (
                                                    <Check className="h-4 w-4 shrink-0 text-primary" />
                                                  ) : null}
                                                </CommandItem>
                                                {taxes.map((tax) => (
                                                  <CommandItem
                                                    key={tax.id}
                                                    onSelect={() =>
                                                      handleItemTaxToggle(
                                                        index,
                                                        tax
                                                      )
                                                    }
                                                    value={`${tax.name} ${tax.rate}`}
                                                  >
                                                    <span className="flex-1 truncate">
                                                      {tax.name} ({tax.rate}%)
                                                    </span>
                                                    {item.taxes?.some(
                                                      (itemTax) =>
                                                        itemTax.taxId === tax.id
                                                    ) ? (
                                                      <Check className="h-4 w-4 shrink-0 text-primary" />
                                                    ) : null}
                                                  </CommandItem>
                                                ))}
                                              </CommandGroup>
                                            </CommandList>
                                          </Command>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              </>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-muted-foreground text-sm">
                      No hay productos agregados. Utilice el buscador para
                      añadir.
                    </div>
                  )}
                  {form.formState.errors.items && (
                    <p className="font-medium text-destructive text-sm">
                      {form.formState.errors.items.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Notas Adicionales */}
            <Card>
              <CardHeader>
                <CardTitle>Notas (opcional)</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          className="resize-none"
                          placeholder="Ingrese condiciones comerciales, tiempo de entrega, etc..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4 lg:hidden">
              <Button
                disabled={isSubmitting || fields.length === 0}
                type="submit"
              >
                {isSubmitting ? "Guardando..." : submitLabel}
              </Button>
            </div>
          </form>
        </Form>
      </div>

      {/* Panel lateral / Resumen */}
      <div className="flex flex-col gap-6 lg:col-span-4">
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Cantidad de ítems:
                </span>
                <span className="font-medium">{fields.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Total de prendas/unidades:
                </span>
                <span className="font-medium">
                  {formItems.reduce((acc, it) => acc + it.totalQuantity, 0)}
                </span>
              </div>

              <div className="my-4 h-px bg-border" />

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(totals.subTotal, currency)}</span>
                </div>
                {totals.lineDiscountTotal > 0 ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Descuento línea
                    </span>
                    <span className="font-medium text-emerald-600">
                      -{formatCurrency(totals.lineDiscountTotal, currency)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex flex-1 items-center gap-2">
                    <span className="shrink-0 text-muted-foreground">
                      Descuento global
                    </span>
                    <Input
                      className="h-8 w-20"
                      inputMode="decimal"
                      max={100}
                      min={0}
                      onChange={(event) => {
                        const parsed = Number.parseFloat(event.target.value);
                        form.setValue(
                          "globalDiscountPercentage",
                          Number.isNaN(parsed) ? 0 : clampPercentage(parsed),
                          { shouldDirty: true }
                        );
                      }}
                      step="0.01"
                      type="number"
                      value={
                        (globalDiscountPercentage ?? 0) === 0
                          ? ""
                          : (globalDiscountPercentage ?? 0)
                      }
                    />
                  </div>
                  {totals.globalDiscountAmount > 0 ? (
                    <span className="font-medium text-emerald-600">
                      -{formatCurrency(totals.globalDiscountAmount, currency)}
                    </span>
                  ) : null}
                </div>
                {totals.taxPlan.aggregateTaxes.map((tax) => (
                  <div
                    className="flex items-center justify-between text-sm"
                    key={`${tax.taxId ?? "no-tax"}-${tax.name}-${tax.rate}`}
                  >
                    <span className="text-muted-foreground">
                      {tax.name} ({tax.rate}%)
                    </span>
                    <span>{formatCurrency(tax.taxAmount, currency)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex items-center justify-between font-bold text-base">
                  <span>Total</span>
                  <span>{formatCurrency(totals.totalAmount, currency)}</span>
                </div>
              </div>

              <div className="my-4 h-px bg-border" />

              <FileUploadCard
                accept="application/pdf"
                currentUrl={currentFileUrl}
                displayName={displayName}
                inputRef={fileInputRef}
                isImage={false}
                label="Orden de compra (PDF)"
                onChange={handleFileSelect}
                onRemove={handleRemoveFile}
                selectedFile={selectedFile}
              />

              <FileUploadCard
                accept="application/pdf,image/png,image/jpeg"
                currentUrl={currentDesignFileUrl}
                displayName={designDisplayName}
                icon={CloudUpload}
                inputRef={designFileInputRef}
                isImage={isDesignImage}
                label="Boceto / Diseño (PDF, PNG, JPEG)"
                onChange={handleDesignFileSelect}
                onRemove={handleRemoveDesignFile}
                selectedFile={selectedDesignFile}
              />

              <div className="my-4 h-px bg-border" />
              <div className="hidden flex-col gap-2 pt-4 lg:flex">
                <Button
                  className="w-full"
                  disabled={isSubmitting || fields.length === 0}
                  onClick={form.handleSubmit(onSubmit)}
                  size="lg"
                >
                  {isSubmitting ? "Guardando..." : submitLabel}
                </Button>
                {onCancel && (
                  <Button
                    className="w-full"
                    disabled={isSubmitting}
                    onClick={onCancel}
                    type="button"
                    variant="outline"
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ProductVariantsGridDialog
        initialQuantities={editingInitialQuantities}
        isOpen={isGridOpen}
        key={
          selectedProduct
            ? `${selectedProduct.id}-${editingItemIndex ?? "new"}`
            : "empty"
        }
        onConfirm={handleVariantsConfirm}
        onOpenChange={handleGridOpenChange}
        orgSlug={orgSlug}
        product={selectedProduct}
      />
    </div>
  );
}

function ConvertCurrencySection({
  convertingCurrency,
  currency,
  exchangeRate,
  onConvert,
}: {
  convertingCurrency: boolean;
  currency: string;
  exchangeRate: number | null;
  onConvert: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t pt-4">
      {currency === "ARS" ? (
        <Button
          disabled={convertingCurrency}
          onClick={onConvert}
          size="sm"
          type="button"
          variant="outline"
        >
          {convertingCurrency
            ? "Obteniendo cotización..."
            : "Convertir a Dólares"}
        </Button>
      ) : (
        <Button onClick={onConvert} size="sm" type="button" variant="outline">
          Convertir a Pesos
        </Button>
      )}
      {currency === "USD" && exchangeRate && (
        <span className="text-muted-foreground text-sm">
          Cotización: {formatCurrency(exchangeRate, "ARS")}
        </span>
      )}
    </div>
  );
}

function FileUploadCard({
  label,
  accept,
  displayName,
  currentUrl,
  selectedFile,
  isImage,
  inputRef,
  onChange,
  onRemove,
  icon: IconOverride,
}: {
  label: string;
  accept: string;
  displayName: string | null;
  currentUrl: string | null | undefined;
  selectedFile: File | null | undefined;
  isImage: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  icon?: React.ElementType;
}) {
  const Icon = IconOverride || (displayName && isImage ? FileImage : FilePdf);
  const iconClass =
    IconOverride || (displayName && isImage)
      ? "h-4 w-4 shrink-0 text-primary"
      : "h-4 w-4 shrink-0 text-destructive";
  return (
    <div className="space-y-2">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <input
        accept={accept}
        className="hidden"
        onChange={onChange}
        ref={inputRef}
        type="file"
      />
      {displayName ? (
        <div className="flex items-center gap-2">
          <Icon className={iconClass} />
          <span className="flex-1 truncate text-sm">{displayName}</span>
          {currentUrl && !selectedFile && (
            <Button
              onClick={() => window.open(currentUrl, "_blank")}
              size="sm"
              type="button"
              variant="outline"
            >
              Ver
            </Button>
          )}
          <Button onClick={onRemove} size="sm" type="button" variant="ghost">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          className="w-full"
          onClick={() => inputRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          <Upload className="mr-1.5 h-3 w-3" />
          Cargar {label.split(" ")[0].toLowerCase()}
        </Button>
      )}
    </div>
  );
}
