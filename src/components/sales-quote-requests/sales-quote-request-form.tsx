"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CaseUnitQuantityFields } from "@/components/products/case-unit-quantity-fields";
import { WhatsAppApprovalShare } from "@/components/sales-quote-requests/whatsapp-approval-share";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchableCatalogPicker } from "@/components/ui/searchable-catalog-picker";
import { Spinner } from "@/components/ui/spinner";
import { truncateMoney, truncateToDecimals } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import { generatePDFBlobFromHTML } from "@/lib/pdf-generator";
import type { Customer } from "@/modules/customers/types";
import { formatCaseUnitQuantity } from "@/modules/inventory/utils/case-units";
import type { StoredOfflineSalesQuoteCommand } from "@/modules/offline/contracts/offline-sales-quote-command";
import {
  enqueueOfflineSalesQuoteCommand,
  getSellerSnapshot,
  listOfflineSalesQuoteCommands,
} from "@/modules/offline/storage/offline-db";
import {
  retryOfflineSalesQuoteCommand,
  syncOfflineSalesQuotes,
} from "@/modules/offline/sync/offline-sales-quote-sync";
import {
  calculateSalePrice,
  type SalePriceAdjustment,
} from "@/modules/price-levels/service/price-calculator";
import type { PriceLevelWithStatus } from "@/modules/price-levels/types";
import { convertPriceToQuoteCurrency } from "@/modules/quotes/utils/currency-conversion";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";
import {
  convertClientQuoteDraftAction,
  saveClientQuoteDraftAction,
} from "@/modules/sales-quote-requests/actions/client-quote-drafts.action";
import { createSalesQuoteRequestAction } from "@/modules/sales-quote-requests/actions/create-sales-quote-request.action";
import { updateSalesQuoteRequestAction } from "@/modules/sales-quote-requests/actions/update-sales-quote-request.action";
import {
  type AdditionalQuoteTax,
  additionalQuoteTaxSchema,
  calculateQuoteTaxes,
} from "@/modules/sales-quote-requests/client-quote-taxes";
import {
  calculateCompetitivePriceSuggestion,
  normalizeQuoteUnitPrice,
  type SalesQuotePricingMethod,
} from "@/modules/sales-quote-requests/competitive-pricing";
import { quoteProductStockLabel } from "@/modules/sales-quote-requests/product-stock";
import {
  isValidCaseQuoteQuantity,
  type QuoteSellingUnit,
  quoteSellingUnitFactor,
} from "@/modules/sales-quote-requests/selling-unit";
import type { SalesQuoteRequestEditValues } from "@/modules/sales-quote-requests/service/my-sales-quote-requests.service";
import type { CreateSalesQuoteRequestInput } from "@/modules/sales-quote-requests/service/sales-quote-requests.service";
import { canShareSyncedOfflineQuote } from "@/modules/sales-quote-requests/whatsapp-approval-share";

type ProductVariantOption = {
  id: string;
  productId: string;
  talle: string;
  color: string;
};

type RequestItemDraft = {
  id: string;
  productId: string;
  productVariantId: string | null;
  sellingUnit: QuoteSellingUnit;
  quantity: string;
  pricingMethod: SalesQuotePricingMethod;
  competitorUnitPrice: string;
  discountPercentage: string;
  agreedUnitPrice: string | null;
  comment: string;
};

type ParsedRequestItemDraft = RequestItemDraft & {
  quantityNumber: number;
  competitorPriceNumber: number;
  agreedPriceNumber: number;
  baseUnitPriceNumber: number;
  pricingValid: boolean;
};

function hasInvalidQuoteItems(items: ParsedRequestItemDraft[]) {
  return items.some(
    (item) =>
      !item.pricingValid ||
      (item.pricingMethod === "COMPETITOR" &&
        item.competitorUnitPrice.trim() === "") ||
      (item.pricingMethod === "PERCENTAGE" &&
        (item.discountPercentage.trim() === "" ||
          Number(item.discountPercentage) < 0 ||
          Number(item.discountPercentage) > 100 ||
          item.agreedPriceNumber > item.baseUnitPriceNumber)) ||
      (item.agreedUnitPrice != null && item.agreedUnitPrice.trim() === "") ||
      !Number.isFinite(item.agreedPriceNumber) ||
      item.agreedPriceNumber < 0 ||
      !Number.isFinite(item.quantityNumber) ||
      item.quantityNumber <= 0 ||
      !Number.isFinite(item.competitorPriceNumber) ||
      item.competitorPriceNumber < 0
  );
}

type SalesQuoteRequestFormProps = {
  orgSlug: string;
  ownerUserId: string;
  organizationId: string;
  customers: Customer[];
  products: SaleProduct[];
  priceLevels: PriceLevelWithStatus[];
  salesPriceLists: SalesPriceList[];
  variants: ProductVariantOption[];
  requestId?: string;
  initialValues?: SalesQuoteRequestEditValues;
  initialDraft?: { id: string; values: CreateSalesQuoteRequestInput };
  snapshotPriceByLevel?: Record<string, Record<string, number>>;
};

const selectClassName =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm";

function customerName(customer: Customer): string {
  return customer.fantasy_name || customer.business_name || "Cliente";
}

function buildLineView(params: {
  item: RequestItemDraft;
  products: SaleProduct[];
  priceLevel: PriceLevelWithStatus | undefined;
  priceAdjustments: SalePriceAdjustment[];
  currency: "ARS" | "USD";
  exchangeRate: number;
  snapshotPriceByLevel?: Record<string, Record<string, number>>;
}) {
  const {
    item,
    products,
    priceLevel,
    priceAdjustments,
    currency,
    exchangeRate,
  } = params;
  const product = products.find((entry) => entry.id === item.productId);
  if (!product) {
    return { item, product: null, baseUnitPrice: 0, suggestion: null };
  }

  let factor: number;
  try {
    factor = quoteSellingUnitFactor(product, item.sellingUnit);
  } catch {
    return { item, product, baseUnitPrice: 0, suggestion: null };
  }

  const snapshotBasePrice = priceLevel
    ? params.snapshotPriceByLevel?.[product.id]?.[priceLevel.id]
    : undefined;
  if (params.snapshotPriceByLevel && priceLevel && snapshotBasePrice == null) {
    return { item, product, baseUnitPrice: 0, suggestion: null };
  }
  const salePrice =
    snapshotBasePrice == null
      ? calculateSalePrice({
          basePrice: product.price,
          costPrice: product.costPrice,
          level: priceLevel,
          adjustments: priceAdjustments,
        }).price
      : calculateSalePrice({
          basePrice: snapshotBasePrice,
          adjustments: priceAdjustments,
        }).price;
  const convertedPrice = convertPriceToQuoteCurrency(
    salePrice,
    product.currency,
    currency,
    exchangeRate
  );
  const baseUnitPrice =
    product.unitOfMeasure === "CAJA"
      ? factor * convertedPrice
      : truncateMoney(factor * convertedPrice);
  const selectedAgreedPrice =
    item.agreedUnitPrice == null || item.agreedUnitPrice.trim() === ""
      ? undefined
      : Number(item.agreedUnitPrice);
  const validSelectedPrice =
    selectedAgreedPrice != null &&
    Number.isFinite(selectedAgreedPrice) &&
    selectedAgreedPrice >= 0
      ? selectedAgreedPrice
      : undefined;
  const suggestion = calculateLineSuggestion(
    item,
    baseUnitPrice,
    validSelectedPrice,
    product.unitOfMeasure === "CAJA"
  );

  return { item, product, baseUnitPrice, suggestion };
}

function calculateLineSuggestion(
  item: RequestItemDraft,
  baseUnitPrice: number,
  selectedAgreedPrice: number | undefined,
  preserveUnitPrecision: boolean
) {
  if (item.pricingMethod === "COMPETITOR") {
    const competitorPrice = Number(item.competitorUnitPrice);
    if (
      item.competitorUnitPrice.trim() === "" ||
      !Number.isFinite(competitorPrice) ||
      competitorPrice < 0
    ) {
      return null;
    }
    return calculateCompetitivePriceSuggestion(
      baseUnitPrice,
      competitorPrice,
      selectedAgreedPrice,
      preserveUnitPrecision
    );
  }

  if (item.pricingMethod === "PERCENTAGE") {
    const percentage = Number(item.discountPercentage);
    if (
      item.discountPercentage.trim() === "" ||
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      return null;
    }
    const percentagePrice = preserveUnitPrecision
      ? baseUnitPrice * (1 - percentage / 100)
      : truncateMoney(baseUnitPrice * (1 - percentage / 100));
    return calculateCompetitivePriceSuggestion(
      baseUnitPrice,
      baseUnitPrice,
      selectedAgreedPrice ?? percentagePrice,
      preserveUnitPrecision
    );
  }

  return calculateCompetitivePriceSuggestion(
    baseUnitPrice,
    baseUnitPrice,
    selectedAgreedPrice ?? baseUnitPrice,
    preserveUnitPrecision
  );
}

function buildRequestValues(params: {
  orgSlug: string;
  customerId: string;
  customerSegment: "ACTIVE" | "NEW" | "REACTIVATED";
  sellerZone: string;
  currency: "ARS" | "USD";
  exchangeRate: number;
  priceLevelId: string;
  salesPriceListId: string;
  paymentMethod: string;
  paymentTerm: string;
  invoiceType: string;
  observations: string;
  clientQuoteEnabled: boolean;
  additionalTaxes: AdditionalQuoteTax[];
  items: ParsedRequestItemDraft[];
  products: SaleProduct[];
}): CreateSalesQuoteRequestInput {
  const exchangeRequired = params.items.some((item) => {
    const product = params.products.find(
      (entry) => entry.id === item.productId
    );
    return product?.currency !== params.currency;
  });

  return {
    orgSlug: params.orgSlug,
    customerId: params.customerId,
    customerSegment: params.customerSegment,
    sellerZone: params.sellerZone.trim(),
    currency: params.currency,
    exchangeRate:
      Number.isFinite(params.exchangeRate) &&
      params.exchangeRate > 0 &&
      (params.currency !== "ARS" || exchangeRequired)
        ? params.exchangeRate
        : null,
    priceLevelId: params.priceLevelId || null,
    salesPriceListId: params.salesPriceListId || null,
    paymentMethod: params.paymentMethod.trim(),
    paymentTerm: params.paymentTerm.trim(),
    invoiceType: params.invoiceType as
      | "NOTA_DE_VENTA"
      | "FACTURA_A"
      | "FACTURA_A_RETENCION"
      | "FACTURA_B"
      | "FACTURA_C"
      | "FACTURA_E",
    observations: params.observations.trim(),
    clientQuoteEnabled: params.clientQuoteEnabled,
    additionalTaxes: params.additionalTaxes,
    items: params.items.map((item) => ({
      productId: item.productId,
      productVariantId: item.productVariantId ?? null,
      sellingUnit: item.sellingUnit,
      quantity: item.quantityNumber,
      pricingMethod: item.pricingMethod,
      competitorUnitPrice: item.competitorPriceNumber,
      agreedUnitPrice: item.agreedPriceNumber,
      discountPercentage:
        item.pricingMethod === "PERCENTAGE"
          ? Number(item.discountPercentage)
          : undefined,
      comment: item.comment,
    })),
  };
}

async function submitRequest(
  requestId: string | undefined,
  values: CreateSalesQuoteRequestInput
): Promise<
  | { type: "created"; requestId: string }
  | { type: "updated" }
  | { type: "error"; message: string }
> {
  if (requestId) {
    const result = await updateSalesQuoteRequestAction({ requestId, values });
    return result.success
      ? { type: "updated" }
      : { type: "error", message: result.error };
  }

  const result = await createSalesQuoteRequestAction(values);
  return result.success
    ? { type: "created", requestId: result.requestId }
    : { type: "error", message: result.error };
}

async function queueOfflineQuote(params: {
  ownerUserId: string;
  organizationId: string;
  orgSlug: string;
  values: CreateSalesQuoteRequestInput;
}): Promise<"queued" | "missing-snapshot" | "failed"> {
  const stored = await getSellerSnapshot(
    params.ownerUserId,
    params.organizationId
  );
  const snapshot = stored?.snapshot;
  if (
    !(stored?.signature && snapshot) ||
    snapshot.organization.slug !== params.orgSlug
  ) {
    return "missing-snapshot";
  }
  try {
    const preparedAt = new Date();
    await enqueueOfflineSalesQuoteCommand({
      commandId: crypto.randomUUID(),
      ownerUserId: params.ownerUserId,
      organizationId: snapshot.organizationId,
      orgSlug: params.orgSlug,
      signature: stored.signature,
      snapshot,
      quote: params.values,
      createdAt: preparedAt.toISOString(),
      preparedOn: `${preparedAt.getFullYear()}-${String(preparedAt.getMonth() + 1).padStart(2, "0")}-${String(preparedAt.getDate()).padStart(2, "0")}`,
    });
    return "queued";
  } catch {
    return "failed";
  }
}

async function submitOrQueueQuote(params: {
  requestId?: string;
  useSnapshot: boolean;
  ownerUserId: string;
  organizationId: string;
  orgSlug: string;
  values: CreateSalesQuoteRequestInput;
}): Promise<
  | { type: "queued" }
  | { type: "missing-snapshot" }
  | { type: "queue-error" }
  | Awaited<ReturnType<typeof submitRequest>>
> {
  if (!params.requestId && (params.useSnapshot || !navigator.onLine)) {
    const result = await queueOfflineQuote(params);
    if (result === "missing-snapshot") {
      return { type: "missing-snapshot" };
    }
    if (result === "failed") {
      return { type: "queue-error" };
    }
    return { type: "queued" };
  }
  const now = new Date();
  const preparedOn = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return submitRequest(
    params.requestId,
    params.requestId ? params.values : { ...params.values, preparedOn }
  );
}

function offlineQuoteStatusLabel(record: StoredOfflineSalesQuoteCommand) {
  if (record.status === "queued" || record.status === "syncing") {
    return "Pendiente de envío";
  }
  if (record.status === "synced") {
    return `Enviada a aprobación${record.requestId ? ` · ${record.requestId}` : ""}`;
  }
  return "Requiere revisión";
}

function offlineQuoteCustomerName(record: StoredOfflineSalesQuoteCommand) {
  const customerId = record.command.quote.customerId;
  const customer =
    typeof customerId === "string"
      ? record.command.snapshot.customers.find(
          (entry) => entry.id === customerId
        )
      : null;
  return customer?.fantasyName || customer?.businessName || "Cliente";
}

function downloadAndOpenWhatsApp(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  window.open(
    `https://wa.me/?text=${encodeURIComponent("Te comparto la cotización adjunta.")}`,
    "_blank",
    "noopener,noreferrer"
  );
  toast.info("PDF descargado. Adjuntalo manualmente en WhatsApp");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: coordinates seller form state and pricing preview.
export function SalesQuoteRequestForm({
  orgSlug,
  ownerUserId,
  organizationId,
  customers,
  products,
  priceLevels,
  salesPriceLists,
  variants,
  requestId,
  initialValues,
  initialDraft,
  snapshotPriceByLevel,
}: SalesQuoteRequestFormProps) {
  const router = useRouter();
  const draftValues = initialDraft?.values;
  const [draftId, setDraftId] = useState(initialDraft?.id);
  const [customerId, setCustomerId] = useState(
    initialValues?.customerId ?? draftValues?.customerId ?? ""
  );
  const customerSegment =
    initialValues?.customerSegment ?? draftValues?.customerSegment ?? "ACTIVE";
  const [sellerZone, setSellerZone] = useState(
    initialValues?.sellerZone ?? draftValues?.sellerZone ?? ""
  );
  // Preserve historical USD requests on edit; all new requests are in pesos.
  const currency = initialValues?.currency ?? draftValues?.currency ?? "ARS";
  const [exchangeRate, setExchangeRate] = useState(
    initialValues?.exchangeRate?.toString() ??
      draftValues?.exchangeRate?.toString() ??
      ""
  );
  const [priceLevelId, setPriceLevelId] = useState(
    initialValues?.priceLevelId ?? draftValues?.priceLevelId ?? ""
  );
  const [salesPriceListId, setSalesPriceListId] = useState(
    initialValues?.salesPriceListId ?? draftValues?.salesPriceListId ?? ""
  );
  const [paymentMethod, setPaymentMethod] = useState(
    initialValues?.paymentMethod ?? draftValues?.paymentMethod ?? ""
  );
  const [paymentTerm, setPaymentTerm] = useState(
    initialValues?.paymentTerm ?? draftValues?.paymentTerm ?? ""
  );
  const [invoiceType, setInvoiceType] = useState(
    initialValues?.invoiceType ?? draftValues?.invoiceType ?? "NOTA_DE_VENTA"
  );
  const [observations, setObservations] = useState(
    initialValues?.observations ?? draftValues?.observations ?? ""
  );
  const [clientQuoteEnabled, setClientQuoteEnabled] = useState(
    draftValues?.clientQuoteEnabled ??
      (draftValues?.additionalTaxes?.length ?? 0) > 0
  );
  const [additionalTaxes, setAdditionalTaxes] = useState<
    { id: string; name: string; rate: string }[]
  >(() => {
    const saved = (
      initialValues?.additionalTaxes ??
      draftValues?.additionalTaxes ??
      []
    ).map((tax, index) => ({
      id: `tax-${index}`,
      name: tax.name,
      rate: String(tax.rate),
    }));
    return saved.length === 0 && draftValues?.clientQuoteEnabled
      ? [{ id: "initial-tax", name: "", rate: "" }]
      : saved;
  });
  const [isSharing, setIsSharing] = useState(false);
  const shareReady = useRef<{ fingerprint: string; file: File } | null>(null);
  const [items, setItems] = useState<RequestItemDraft[]>(
    (initialValues?.items ?? draftValues?.items ?? []).map((item, index) => ({
      id: `initial-${index}`,
      productId: item.productId,
      productVariantId: item.productVariantId ?? null,
      sellingUnit: item.sellingUnit ?? "UNIDADES",
      quantity: item.quantity.toString(),
      pricingMethod: item.pricingMethod,
      competitorUnitPrice: item.competitorUnitPrice?.toString() ?? "",
      discountPercentage: item.discountPercentage?.toString() ?? "",
      agreedUnitPrice: item.agreedUnitPrice?.toString() ?? null,
      comment: item.comment ?? "",
    }))
  );
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedSellingUnit, setSelectedSellingUnit] =
    useState<QuoteSellingUnit>("UNIDADES");
  const [isPending, startTransition] = useTransition();
  const [isAddingItem, startAddingItem] = useTransition();
  const [offlineQuoteCommands, setOfflineQuoteCommands] = useState<
    StoredOfflineSalesQuoteCommand[]
  >([]);

  useEffect(() => {
    const refreshQueue = () => {
      listOfflineSalesQuoteCommands(ownerUserId)
        .then(setOfflineQuoteCommands)
        .catch((error: unknown) => {
          console.error(
            "No se pudo leer la cola offline de cotizaciones",
            error
          );
        });
    };
    refreshQueue();
    window.addEventListener(
      "rhinos-offline-sales-quote-queue-changed",
      refreshQueue
    );
    return () =>
      window.removeEventListener(
        "rhinos-offline-sales-quote-queue-changed",
        refreshQueue
      );
  }, [ownerUserId]);

  useEffect(() => {
    const syncQuotes = () => {
      syncOfflineSalesQuotes(ownerUserId).catch((error: unknown) => {
        console.error("No se pudieron sincronizar cotizaciones offline", error);
      });
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") {
        syncQuotes();
      }
    };
    syncQuotes();
    window.addEventListener("online", syncQuotes);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.removeEventListener("online", syncQuotes);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [ownerUserId]);

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );
  const selectedProduct = products.find(
    (product) => product.id === selectedProductId
  );
  const customerOptions = useMemo(
    () =>
      customers.map((customer) => ({
        value: customer.id,
        label: customerName(customer),
        description: [customer.client_number, customer.city]
          .filter(Boolean)
          .join(" · "),
        searchText: `${customer.business_name ?? ""} ${customer.fantasy_name ?? ""} ${customer.cuit ?? ""}`,
      })),
    [customers]
  );
  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        description: [
          quoteProductStockLabel(product, snapshotPriceByLevel !== undefined),
          product.sku && `SKU ${product.sku}`,
          formatCurrency(product.price, product.currency),
        ]
          .filter(Boolean)
          .join(" · "),
        searchText: `${product.sku} ${product.brand ?? ""} ${product.supplierName ?? ""}`,
      })),
    [products, snapshotPriceByLevel]
  );

  const handleCustomerChange = (nextCustomerId: string) => {
    setCustomerId(nextCustomerId);
    const customer = customers.find((entry) => entry.id === nextCustomerId);
    setPriceLevelId(
      customer?.price_level_id &&
        priceLevels.some(
          (level) =>
            level.id === customer.price_level_id && level.status === "Active"
        )
        ? customer.price_level_id
        : ""
    );
    setSalesPriceListId(
      customer?.sales_price_list_id &&
        salesPriceLists.some((list) => list.id === customer.sales_price_list_id)
        ? customer.sales_price_list_id
        : ""
    );
  };

  const priceLevel = priceLevels.find((level) => level.id === priceLevelId);
  const salesPriceList = salesPriceLists.find(
    (list) => list.id === salesPriceListId
  );
  const priceAdjustments: SalePriceAdjustment[] = salesPriceList
    ? [{ type: salesPriceList.type, value: salesPriceList.value }]
    : [];
  const exchangeRateNumber = Number(exchangeRate);

  const lineViews = useMemo(
    () =>
      items.map((item) =>
        buildLineView({
          item,
          products,
          priceLevel,
          priceAdjustments,
          currency,
          exchangeRate: exchangeRateNumber,
          snapshotPriceByLevel,
        })
      ),
    [
      currency,
      exchangeRateNumber,
      items,
      priceAdjustments,
      priceLevel,
      products,
      snapshotPriceByLevel,
    ]
  );

  const subtotal = lineViews.reduce((sum, line) => {
    if (!line.suggestion) {
      return sum;
    }
    const quantity = Number(line.item.quantity);
    return Number.isFinite(quantity) && quantity > 0
      ? sum + truncateMoney(line.suggestion.agreedUnitPrice * quantity)
      : sum;
  }, 0);
  const showAdditionalTaxes = Boolean(requestId || clientQuoteEnabled);
  const enteredAdditionalTaxes = showAdditionalTaxes
    ? additionalTaxes.filter((tax) => tax.name.trim() || tax.rate.trim())
    : [];
  const validAdditionalTaxes = enteredAdditionalTaxes
    .map((tax) => ({ name: tax.name.trim(), rate: Number(tax.rate) }))
    .filter((tax) => additionalQuoteTaxSchema.safeParse(tax).success);
  const taxesValid =
    enteredAdditionalTaxes.length <= 20 &&
    validAdditionalTaxes.length === enteredAdditionalTaxes.length;
  const preview = calculateQuoteTaxes(
    lineViews.flatMap((line, index) => {
      const quantity = Number(line.item.quantity);
      return line.product &&
        line.suggestion &&
        Number.isFinite(quantity) &&
        quantity > 0
        ? [
            {
              lineId: `line-${index + 1}`,
              productId: line.product.id,
              netAmount: truncateMoney(
                line.suggestion.agreedUnitPrice * quantity
              ),
              taxes: line.product.taxes,
            },
          ]
        : [];
    }),
    validAdditionalTaxes
  );

  const handleAddItem = () => {
    if (!selectedProduct) {
      toast.error("Seleccioná un producto");
      return;
    }
    if (
      selectedProduct.hasVariants &&
      !variants.some(
        (variant) =>
          variant.id === selectedVariantId &&
          variant.productId === selectedProduct.id
      )
    ) {
      toast.error("Seleccioná una variante disponible");
      return;
    }
    startAddingItem(() => {
      setItems((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          productId: selectedProduct.id,
          productVariantId: selectedProduct.hasVariants
            ? selectedVariantId
            : null,
          sellingUnit: selectedSellingUnit,
          quantity: selectedProduct.unitOfMeasure === "CAJA" ? "0" : "1",
          pricingMethod: "COMPETITOR",
          competitorUnitPrice: "",
          discountPercentage: "",
          agreedUnitPrice: null,
          comment: "",
        },
      ]);
      setSelectedProductId("");
      setSelectedVariantId("");
      setSelectedSellingUnit("UNIDADES");
    });
  };

  const updateItem = (
    id: string,
    values: Partial<Omit<RequestItemDraft, "id">>
  ) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...values } : item))
    );
  };

  const updatePricingMethod = (
    itemId: string,
    method: SalesQuotePricingMethod,
    baseUnitPrice: number
  ) => {
    const item = items.find((entry) => entry.id === itemId);
    const isCaseProduct = products.some(
      (product) =>
        product.id === item?.productId && product.unitOfMeasure === "CAJA"
    );
    const agreedUnitPrice =
      method === "COMPETITOR"
        ? null
        : normalizeQuoteUnitPrice(baseUnitPrice, isCaseProduct).toString();
    updateItem(itemId, {
      pricingMethod: method,
      competitorUnitPrice: "",
      discountPercentage: method === "PERCENTAGE" ? "0" : "",
      agreedUnitPrice,
    });
  };

  const updatePercentage = (
    itemId: string,
    baseUnitPrice: number,
    value: string
  ) => {
    const item = items.find((entry) => entry.id === itemId);
    const isCaseProduct = products.some(
      (product) =>
        product.id === item?.productId && product.unitOfMeasure === "CAJA"
    );
    const percentage = Number(value);
    const agreedUnitPrice =
      value.trim() !== "" &&
      Number.isFinite(percentage) &&
      percentage >= 0 &&
      percentage <= 100
        ? (isCaseProduct
            ? baseUnitPrice * (1 - percentage / 100)
            : truncateMoney(baseUnitPrice * (1 - percentage / 100))
          ).toString()
        : "";
    updateItem(itemId, { discountPercentage: value, agreedUnitPrice });
  };

  const updateAgreedPrice = (
    item: RequestItemDraft,
    baseUnitPrice: number,
    value: string
  ) => {
    if (item.pricingMethod !== "PERCENTAGE") {
      updateItem(item.id, { agreedUnitPrice: value });
      return;
    }

    const agreedPrice = Number(value);
    if (
      value.trim() === "" ||
      !Number.isFinite(agreedPrice) ||
      agreedPrice < 0 ||
      agreedPrice > baseUnitPrice
    ) {
      updateItem(item.id, { agreedUnitPrice: value, discountPercentage: "" });
      return;
    }

    const percentage =
      baseUnitPrice === 0
        ? 0
        : truncateToDecimals(
            ((baseUnitPrice - agreedPrice) / baseUnitPrice) * 100,
            6
          );
    updateItem(item.id, {
      agreedUnitPrice: value,
      discountPercentage: percentage.toString(),
    });
  };

  async function handleQuoteSubmissionResult(
    result: Awaited<ReturnType<typeof submitOrQueueQuote>>
  ) {
    if (result.type === "missing-snapshot") {
      toast.error(
        "Necesitás actualizar los datos offline antes de guardar la cotización"
      );
      return;
    }
    if (result.type === "queue-error") {
      toast.error("No se pudo guardar la cotización offline");
      return;
    }
    if (result.type === "queued") {
      setItems([]);
      setObservations("");
      setOfflineQuoteCommands(await listOfflineSalesQuoteCommands(ownerUserId));
      toast.success(
        "Cotización guardada en la cola offline; se enviará al recuperar conexión"
      );
      syncOfflineSalesQuotes(ownerUserId).catch((error: unknown) => {
        console.error("No se pudieron sincronizar cotizaciones offline", error);
      });
      return;
    }
    if (result.type === "error") {
      toast.error(result.message);
      return;
    }
    if (result.type === "updated") {
      toast.success("Cotización actualizada y enviada a aprobación");
      router.push(`/org/${orgSlug}/solicitudes-venta`);
      router.refresh();
      return;
    }

    toast.success("Solicitud enviada a aprobación");
    router.push(`/org/${orgSlug}/solicitudes-venta`);
    router.refresh();
  }

  const validatedValues = (): CreateSalesQuoteRequestInput | null => {
    if (!selectedCustomer) {
      toast.error("Seleccioná un cliente");
      return null;
    }
    if (!sellerZone.trim()) {
      toast.error("Ingresá la zona del vendedor");
      return null;
    }
    if (items.length === 0) {
      toast.error("Agregá al menos un producto");
      return null;
    }

    const parsedItems = items.map((item, index) => {
      const baseUnitPrice = lineViews[index]?.baseUnitPrice ?? Number.NaN;
      return {
        ...item,
        quantityNumber: Number(item.quantity),
        baseUnitPriceNumber: baseUnitPrice,
        competitorPriceNumber:
          item.pricingMethod === "COMPETITOR"
            ? Number(item.competitorUnitPrice)
            : baseUnitPrice,
        agreedPriceNumber:
          item.agreedUnitPrice == null
            ? (lineViews[index]?.suggestion?.agreedUnitPrice ?? Number.NaN)
            : Number(item.agreedUnitPrice),
        pricingValid: Boolean(lineViews[index]?.suggestion),
      };
    });
    if (
      hasInvalidQuoteItems(parsedItems) ||
      parsedItems.some((item) => {
        const product = products.find((entry) => entry.id === item.productId);
        return (
          product != null &&
          !isValidCaseQuoteQuantity(
            product,
            item.sellingUnit,
            item.quantityNumber
          )
        );
      })
    ) {
      toast.error("Revisá las cantidades y precios de competencia");
      return null;
    }
    if (!taxesValid) {
      toast.error(
        "Revisá el nombre y porcentaje de los impuestos adicionales (mayor a 0 y hasta 100%)"
      );
      return null;
    }
    return buildRequestValues({
      orgSlug,
      customerId,
      customerSegment,
      sellerZone,
      currency,
      exchangeRate: exchangeRateNumber,
      priceLevelId,
      salesPriceListId,
      paymentMethod,
      paymentTerm,
      invoiceType,
      observations,
      clientQuoteEnabled,
      additionalTaxes: validAdditionalTaxes,
      items: parsedItems,
      products,
    });
  };

  const saveDraft = async () => {
    const values = validatedValues();
    if (!values) {
      return null;
    }
    const result = await saveClientQuoteDraftAction(values, draftId);
    if (!result.success) {
      toast.error(result.error);
      return null;
    }
    setDraftId(result.draftId);
    router.refresh();
    return result;
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: browser sharing requires separate success, cancellation and fallback paths.
  const handleShare = async () => {
    if (isSharing || isPending) {
      return;
    }
    const currentValues = validatedValues();
    if (!currentValues) {
      return;
    }
    const fingerprint = JSON.stringify(currentValues);
    const ready = shareReady.current;
    if (
      ready?.fingerprint === fingerprint &&
      navigator.canShare?.({ files: [ready.file] }) &&
      navigator.share
    ) {
      setIsSharing(true);
      try {
        // Call share synchronously from the click to retain user activation on iOS.
        await navigator.share({
          files: [ready.file],
          title: "Cotización para el cliente",
        });
        toast.success("Elegí WhatsApp para enviar el PDF");
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          toast.error(
            "No se pudo abrir el menú para compartir. Intentá de nuevo"
          );
        }
      } finally {
        setIsSharing(false);
      }
      return;
    }
    setIsSharing(true);
    try {
      const saved = await saveDraft();
      if (!saved) {
        return;
      }
      const blob = await generatePDFBlobFromHTML(saved.html);
      const fileName = `cotizacion-${saved.draftId}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });
      shareReady.current = { fingerprint, file };
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({
            files: [file],
            title: "Cotización para el cliente",
          });
          toast.success(
            "Cotización guardada. Elegí WhatsApp para enviar el PDF"
          );
          return;
        } catch (error) {
          if (!(error instanceof Error && error.name === "NotAllowedError")) {
            throw error;
          }
          toast.info(
            "PDF listo. Tocá otra vez «Enviar PDF por WhatsApp» para abrir el menú de compartir"
          );
          return;
        }
      }
      downloadAndOpenWhatsApp(blob, fileName);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      toast.error(
        error instanceof Error ? error.message : "No se pudo compartir el PDF"
      );
    } finally {
      setIsSharing(false);
    }
  };

  const handleSubmit = () => {
    const values = validatedValues();
    if (!values) {
      return;
    }
    startTransition(async () => {
      if (!(requestId || snapshotPriceByLevel)) {
        const saved = await saveClientQuoteDraftAction(values, draftId);
        if (!saved.success) {
          toast.error(saved.error);
          return;
        }
        setDraftId(saved.draftId);
        const converted = await convertClientQuoteDraftAction(
          orgSlug,
          saved.draftId
        );
        if (!converted.success) {
          toast.error(converted.error);
          return;
        }
        toast.success("Cotización convertida en petición de aprobación");
        router.push(`/org/${orgSlug}/solicitudes-venta`);
        router.refresh();
        return;
      }
      const result = await submitOrQueueQuote({
        requestId,
        useSnapshot: snapshotPriceByLevel !== undefined,
        ownerUserId,
        organizationId,
        orgSlug,
        values,
      });
      await handleQuoteSubmissionResult(result);
    });
  };

  const exchangeRequired = lineViews.some(
    (line) => line.product && line.product.currency !== currency
  );
  let submitLabel = requestId
    ? "Guardar cambios y reenviar"
    : "Enviar a aprobación";
  if (isPending) {
    submitLabel = requestId ? "Guardando..." : "Enviando...";
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 xl:flex-row">
      {offlineQuoteCommands.length > 0 && (
        <Card className="w-full xl:order-3">
          <CardHeader>
            <CardTitle>Cotizaciones offline</CardTitle>
            <CardDescription>
              Estado de la cola local y solicitudes sincronizadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {offlineQuoteCommands.map((record) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0"
                key={record.command.commandId}
              >
                <div className="text-sm">
                  <p className="font-medium">
                    {offlineQuoteStatusLabel(record)}
                  </p>
                  {canShareSyncedOfflineQuote(record) && record.requestId && (
                    <WhatsAppApprovalShare
                      customerName={offlineQuoteCustomerName(record)}
                      orgSlug={orgSlug}
                      requestId={record.requestId}
                    />
                  )}
                  {record.status === "synced" && record.snapshotExpired && (
                    <p className="text-amber-700">
                      Se preparó con snapshot vencido.
                    </p>
                  )}
                  {record.status === "synced" &&
                    record.historicalCostMissing && (
                      <p className="text-amber-700">
                        No se pudo conservar el costo histórico.
                      </p>
                    )}
                  {record.lastError && (
                    <p className="text-destructive">{record.lastError}</p>
                  )}
                </div>
                {(record.status === "requires-review" ||
                  record.status === "failed") && (
                  <Button
                    onClick={() =>
                      retryOfflineSalesQuoteCommand(
                        record.command.commandId,
                        ownerUserId
                      ).then(() =>
                        listOfflineSalesQuoteCommands(ownerUserId).then(
                          setOfflineQuoteCommands
                        )
                      )
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Reintentar
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <div className="min-w-0 flex-1 space-y-6">
        {!(requestId || snapshotPriceByLevel) && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={clientQuoteEnabled}
                  className="mt-1"
                  id="client-quote-enabled"
                  onCheckedChange={(checked) => {
                    setClientQuoteEnabled(checked === true);
                    if (checked === true && additionalTaxes.length === 0) {
                      setAdditionalTaxes([
                        { id: crypto.randomUUID(), name: "", rate: "" },
                      ]);
                    }
                  }}
                />
                <label
                  className="cursor-pointer space-y-1"
                  htmlFor="client-quote-enabled"
                >
                  <span className="block font-semibold">
                    Cotización para enviar al cliente
                  </span>
                  <span className="block text-muted-foreground text-sm">
                    Activá esta opción para agregar impuestos adicionales y
                    enviar el PDF por WhatsApp.
                  </span>
                </label>
              </div>
              <Button
                disabled={
                  isPending || isSharing || items.length === 0 || !customerId
                }
                onClick={() =>
                  startTransition(async () => {
                    const saved = await saveDraft();
                    if (saved) {
                      toast.success("Cotización guardada en tu cuenta");
                    }
                  })
                }
                type="button"
                variant="outline"
              >
                Guardar borrador
              </Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Datos comerciales</CardTitle>
            <CardDescription>
              {requestId
                ? "Al guardar, la cotización vuelve a la bandeja de aprobación."
                : "Podés guardar un borrador. La petición de aprobación se crea solo cuando lo indiques."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente">
              <SearchableCatalogPicker
                label="Cliente"
                onChange={handleCustomerChange}
                options={customerOptions}
                placeholder="Buscar cliente"
                searchPlaceholder="Buscar por nombre, número o CUIT"
                value={customerId}
              />
            </Field>
            <Field label="Zona del vendedor">
              <Input
                maxLength={120}
                onChange={(event) => setSellerZone(event.target.value)}
                placeholder="Ej.: Zona 6"
                value={sellerZone}
              />
            </Field>
            {exchangeRequired && (
              <Field label="Tipo de cambio">
                <Input
                  inputMode="decimal"
                  min="0.000001"
                  onChange={(event) => setExchangeRate(event.target.value)}
                  placeholder="Ej.: 1200"
                  type="number"
                  value={exchangeRate}
                />
              </Field>
            )}
            <Field label="Lista especial de venta">
              <select
                className={selectClassName}
                onChange={(event) => setSalesPriceListId(event.target.value)}
                value={salesPriceListId}
              >
                <option value="">Sin ajuste adicional</option>
                {salesPriceLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Forma de pago">
              <Input
                maxLength={120}
                onChange={(event) => setPaymentMethod(event.target.value)}
                placeholder="Ej.: Efectivo o transferencia"
                value={paymentMethod}
              />
            </Field>
            <Field label="Plazo">
              <Input
                maxLength={120}
                onChange={(event) => setPaymentTerm(event.target.value)}
                placeholder="Ej.: Contado o 21 días"
                value={paymentTerm}
              />
            </Field>
            <Field label="Tipo de comprobante">
              <select
                className={selectClassName}
                onChange={(event) => setInvoiceType(event.target.value)}
                value={invoiceType}
              >
                <option value="NOTA_DE_VENTA">Nota de venta</option>
                <option value="FACTURA_A">Factura A</option>
                <option value="FACTURA_A_RETENCION">
                  Factura A con retención
                </option>
                <option value="FACTURA_B">Factura B</option>
                <option value="FACTURA_C">Factura C</option>
                <option value="FACTURA_E">Factura E</option>
              </select>
            </Field>
            {selectedCustomer && (
              <p className="text-muted-foreground text-xs sm:col-span-2">
                Precios asignados al cliente: nivel{" "}
                {selectedCustomer.price_level_id
                  ? (priceLevels.find(
                      (level) => level.id === selectedCustomer.price_level_id
                    )?.name ?? "no disponible")
                  : "base"}
                {selectedCustomer.sales_price_list_id
                  ? ` · ${salesPriceLists.find((list) => list.id === selectedCustomer.sales_price_list_id)?.name ?? "lista especial"}`
                  : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Impuestos de la cotización</CardTitle>
            <CardDescription>
              Se incluyen automáticamente IVA y percepciones asignados a cada
              producto.
              {showAdditionalTaxes &&
                " Podés agregar otros impuestos estimados con nombre y porcentaje sobre el subtotal."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showAdditionalTaxes && (
              <div className="space-y-4">
                {additionalTaxes.map((tax) => (
                  <div className="flex flex-wrap items-end gap-3" key={tax.id}>
                    <label
                      className="min-w-40 flex-1 space-y-2 text-sm"
                      htmlFor={`tax-name-${tax.id}`}
                    >
                      <span>Nombre del impuesto</span>
                      <Input
                        id={`tax-name-${tax.id}`}
                        maxLength={100}
                        onChange={(event) =>
                          setAdditionalTaxes((current) =>
                            current.map((entry) =>
                              entry.id === tax.id
                                ? { ...entry, name: event.target.value }
                                : entry
                            )
                          )
                        }
                        placeholder="Ej.: Percepción"
                        value={tax.name}
                      />
                    </label>
                    <label
                      className="w-28 space-y-2 text-sm"
                      htmlFor={`tax-rate-${tax.id}`}
                    >
                      <span>Porcentaje (%)</span>
                      <Input
                        id={`tax-rate-${tax.id}`}
                        inputMode="decimal"
                        max="100"
                        min="0.01"
                        onChange={(event) =>
                          setAdditionalTaxes((current) =>
                            current.map((entry) =>
                              entry.id === tax.id
                                ? { ...entry, rate: event.target.value }
                                : entry
                            )
                          )
                        }
                        step="any"
                        type="number"
                        value={tax.rate}
                      />
                    </label>
                    <Button
                      aria-label={`Quitar impuesto ${tax.name || "sin nombre"}`}
                      onClick={() =>
                        setAdditionalTaxes((current) =>
                          current.filter((entry) => entry.id !== tax.id)
                        )
                      }
                      type="button"
                      variant="outline"
                    >
                      Quitar
                    </Button>
                  </div>
                ))}
                <Button
                  disabled={additionalTaxes.length >= 20}
                  onClick={() =>
                    setAdditionalTaxes((current) => [
                      ...current,
                      { id: crypto.randomUUID(), name: "", rate: "" },
                    ])
                  }
                  type="button"
                  variant="outline"
                >
                  Agregar otro impuesto
                </Button>
              </div>
            )}
            <div className="space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(preview.subtotal, currency)}</span>
              </div>
              {preview.taxBreakdown.map((tax, index) => (
                <div
                  className="flex justify-between gap-2"
                  key={`${tax.name}-${tax.rate}-${index}`}
                >
                  <span>
                    {tax.name} ({tax.rate}%)
                  </span>
                  <span>{formatCurrency(tax.taxAmount, currency)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total estimado</span>
                <span>{formatCurrency(preview.total, currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Productos</CardTitle>
            <CardDescription>
              Elegí una modalidad de precio para cada producto y completá sus
              valores.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="sales-quote-product-picker flex flex-col gap-4">
              <div className="min-w-0">
                <Field label="Producto">
                  <SearchableCatalogPicker
                    label="Producto"
                    onChange={(value) => {
                      setSelectedProductId(value);
                      setSelectedVariantId("");
                      setSelectedSellingUnit("UNIDADES");
                    }}
                    options={productOptions}
                    placeholder="Buscar producto"
                    searchPlaceholder="Buscar por nombre, SKU, marca o proveedor"
                    value={selectedProductId}
                  />
                </Field>
                {selectedProduct && (
                  <p className="mt-2 text-muted-foreground text-sm">
                    {quoteProductStockLabel(
                      selectedProduct,
                      snapshotPriceByLevel !== undefined
                    )}
                  </p>
                )}
              </div>
              {selectedProduct?.hasVariants && (
                <Field label="Variante">
                  <SearchableCatalogPicker
                    label="Variante"
                    onChange={setSelectedVariantId}
                    options={variants
                      .filter(
                        (variant) => variant.productId === selectedProduct.id
                      )
                      .map((variant) => ({
                        value: variant.id,
                        label: `${variant.color} / ${variant.talle}`,
                      }))}
                    placeholder="Buscar variante"
                    searchPlaceholder="Buscar color o talle"
                    value={selectedVariantId}
                  />
                </Field>
              )}
              <Field label="Unidad de venta">
                {selectedProduct?.unitOfMeasure === "UN" ? (
                  <select
                    aria-label="Unidad de venta"
                    className={selectClassName}
                    onChange={(event) =>
                      setSelectedSellingUnit(
                        event.target.value as QuoteSellingUnit
                      )
                    }
                    value={selectedSellingUnit}
                  >
                    <option value="UNIDADES">UNIDADES</option>
                    {Number.isInteger(selectedProduct.unitsPerBox) &&
                      (selectedProduct.unitsPerBox ?? 0) > 0 && (
                        <option value="CAJAS">
                          CAJAS ({selectedProduct.unitsPerBox} unidades)
                        </option>
                      )}
                  </select>
                ) : (
                  <div className="flex h-9 min-w-0 items-center rounded-md border bg-muted/30 px-3 text-muted-foreground text-sm">
                    {selectedProduct?.unitOfMeasure === "CAJA"
                      ? `CAJA · ${selectedProduct.unitsPerBox} unidades por caja`
                      : (selectedProduct?.unitOfMeasure ??
                        "Seleccioná un producto")}
                  </div>
                )}
              </Field>
              <Button
                className="w-full md:w-auto md:min-w-40"
                disabled={
                  isAddingItem ||
                  !selectedProduct ||
                  (selectedProduct.hasVariants && !selectedVariantId)
                }
                onClick={handleAddItem}
                type="button"
                variant="outline"
              >
                {isAddingItem ? (
                  <>
                    <Spinner className="mr-2" /> Agregando...
                  </>
                ) : (
                  "Agregar producto"
                )}
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
                Todavía no agregaste productos a la solicitud.
              </div>
            ) : (
              <div className="space-y-4">
                {lineViews.map(
                  ({ item, product, baseUnitPrice, suggestion }) => (
                    <RequestItemCard
                      baseUnitPrice={baseUnitPrice}
                      currency={currency}
                      item={item}
                      key={item.id}
                      onAgreedPriceChange={(value) =>
                        updateAgreedPrice(item, baseUnitPrice, value)
                      }
                      onPercentageChange={(value) =>
                        updatePercentage(item.id, baseUnitPrice, value)
                      }
                      onPricingMethodChange={(method) =>
                        updatePricingMethod(item.id, method, baseUnitPrice)
                      }
                      onRemove={() =>
                        setItems((current) =>
                          current.filter((entry) => entry.id !== item.id)
                        )
                      }
                      onUpdate={(values) => updateItem(item.id, values)}
                      product={product}
                      suggestion={suggestion}
                      variant={variants.find(
                        (entry) => entry.id === item.productVariantId
                      )}
                    />
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={4000}
              onChange={(event) => setObservations(event.target.value)}
              placeholder="Contexto comercial adicional"
              value={observations}
            />
          </CardContent>
        </Card>
        {!requestId && (
          <Card id="client-quote-actions">
            <CardHeader>
              <CardTitle>
                {clientQuoteEnabled
                  ? "Cotización para el cliente"
                  : "Petición de aprobación"}
              </CardTitle>
              <CardDescription>
                {clientQuoteEnabled
                  ? "El PDF es una estimación comercial, no un comprobante fiscal. Enviar el PDF no crea una petición de aprobación."
                  : "Activá la casilla «Cotización para enviar al cliente» al principio si también querés enviar un PDF por WhatsApp."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              {clientQuoteEnabled && !snapshotPriceByLevel && (
                <Button
                  disabled={
                    isPending || isSharing || items.length === 0 || !customerId
                  }
                  onClick={handleShare}
                  type="button"
                  variant="outline"
                >
                  {isSharing && <Spinner className="mr-2" />}
                  Enviar PDF por WhatsApp
                </Button>
              )}
              <Button
                disabled={
                  isPending || isSharing || items.length === 0 || !customerId
                }
                onClick={handleSubmit}
                type="button"
              >
                {isPending && <Spinner className="mr-2" />}
                {snapshotPriceByLevel
                  ? "Guardar solicitud offline para aprobación"
                  : "Convertir en petición de aprobación"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="w-full min-w-0 xl:w-80 xl:max-w-xs">
        <div className="space-y-4 xl:sticky xl:top-6">
          <Card className="h-fit min-w-0">
            <CardHeader>
              <CardTitle>Resumen de solicitud</CardTitle>
              <CardDescription>
                Los precios y descuentos quedan congelados al enviarla.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Productos</span>
                <span>{items.length}</span>
              </div>
              <div className="flex justify-between border-t pt-4 font-semibold">
                <span>
                  {requestId ? "Subtotal propuesto" : "Total estimado"}
                </span>
                <span>
                  {formatCurrency(
                    requestId ? subtotal : preview.total,
                    currency
                  )}
                </span>
              </div>
              {requestId && (
                <Button
                  className="w-full"
                  disabled={isPending || items.length === 0 || !customerId}
                  onClick={handleSubmit}
                  type="button"
                >
                  {isPending && <Spinner className="mr-2" />}
                  {submitLabel}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  labelClassName,
}: {
  label: string;
  children: ReactNode;
  labelClassName?: string;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <p className={`font-medium text-sm ${labelClassName ?? ""}`}>{label}</p>
      {children}
    </div>
  );
}

function getAdjustmentLabel(
  suggestion: ReturnType<typeof calculateCompetitivePriceSuggestion> | null
): string {
  if (!suggestion) {
    return "Precio acordado";
  }
  if (suggestion.adjustmentType === "DISCOUNT") {
    const percentage = suggestion.discountPercentage.toLocaleString("es-AR", {
      maximumFractionDigits: 1,
    });
    return `Descuento sugerido: ${percentage}%`;
  }
  if (suggestion.adjustmentType === "PRICE_OVERRIDE") {
    return "Ajuste de precio al alza";
  }
  if (suggestion.competitorUnitPrice > suggestion.baseUnitPrice) {
    return "Precio de lista";
  }
  return "Sin ajuste sugerido";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: displays pricing modes and valid sale units for each quote line.
function RequestItemCard({
  item,
  product,
  variant,
  baseUnitPrice,
  suggestion,
  currency,
  onUpdate,
  onPricingMethodChange,
  onPercentageChange,
  onAgreedPriceChange,
  onRemove,
}: {
  item: RequestItemDraft;
  product: SaleProduct | null;
  variant: ProductVariantOption | undefined;
  baseUnitPrice: number;
  suggestion: ReturnType<typeof calculateCompetitivePriceSuggestion> | null;
  currency: string;
  onUpdate: (values: Partial<Omit<RequestItemDraft, "id">>) => void;
  onPricingMethodChange: (method: SalesQuotePricingMethod) => void;
  onPercentageChange: (value: string) => void;
  onAgreedPriceChange: (value: string) => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const itemLabelClassName = "flex h-12 items-end overflow-hidden leading-5";
  const quantity = Number(item.quantity);
  const caseUnitsPerBox =
    product?.unitOfMeasure === "CAJA" &&
    Number.isSafeInteger(product.unitsPerBox) &&
    (product.unitsPerBox ?? 0) > 0
      ? product.unitsPerBox
      : null;
  const lineTotal =
    suggestion && Number.isFinite(quantity) && quantity > 0
      ? truncateMoney(suggestion.agreedUnitPrice * quantity)
      : null;
  const adjustmentLabel = getAdjustmentLabel(suggestion);
  let finalPriceLabel = `Precio lista (${currency})`;
  if (item.pricingMethod === "COMPETITOR") {
    finalPriceLabel = adjustmentLabel;
  } else if (item.pricingMethod === "PERCENTAGE") {
    finalPriceLabel = `Precio final (${currency})`;
  }

  return (
    <div className="min-w-0 rounded-lg border">
      {collapsed && (
        <button
          aria-controls={`quote-item-${item.id}`}
          aria-expanded={false}
          aria-label={`Editar ${product?.name ?? "producto"}`}
          className="flex min-h-16 w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          onClick={() => setCollapsed(false)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {product?.name ?? "Producto"}
              {variant ? ` · ${variant.color} / ${variant.talle}` : ""}
            </span>
            <span className="block truncate text-muted-foreground text-xs">
              SKU {product?.sku ?? "—"} ·{" "}
              {caseUnitsPerBox &&
              Number.isSafeInteger(quantity) &&
              quantity >= 0
                ? formatCaseUnitQuantity(quantity, caseUnitsPerBox)
                : `${item.quantity} ${item.sellingUnit === "CAJAS" ? "cajas" : (product?.unitOfMeasure ?? "unidades")}`}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 font-semibold text-sm">
            {lineTotal == null ? "—" : formatCurrency(lineTotal, currency)}
            <ChevronDown
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
          </span>
        </button>
      )}
      <div
        className={collapsed ? "hidden p-3 sm:p-4 md:block" : "p-3 sm:p-4"}
        id={`quote-item-${item.id}`}
      >
        <div className="mb-4 flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row">
          <div className="min-w-0">
            <p className="break-words font-medium">
              {product?.name ?? "Producto"}
              {variant ? ` · ${variant.color} / ${variant.talle}` : ""}
            </p>
            <p className="text-muted-foreground text-xs">
              {product?.sku} · Precio base cotizado
              {caseUnitsPerBox ? " por caja" : ""}:{" "}
              {formatCurrency(
                caseUnitsPerBox
                  ? baseUnitPrice * caseUnitsPerBox
                  : baseUnitPrice,
                currency
              )}
            </p>
          </div>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {caseUnitsPerBox ? (
            <div className="space-y-2 sm:col-span-2 xl:col-span-2">
              <p className="font-medium text-sm">Cantidad</p>
              <CaseUnitQuantityFields
                onChange={(totalUnits) =>
                  onUpdate({ quantity: totalUnits.toString() })
                }
                showTotalUnitsInput
                totalUnits={
                  Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0
                }
                unitsPerBox={caseUnitsPerBox}
              />
              <p className="text-muted-foreground text-xs">
                {formatCaseUnitQuantity(
                  Number.isSafeInteger(quantity) && quantity >= 0
                    ? quantity
                    : 0,
                  caseUnitsPerBox
                )}
              </p>
            </div>
          ) : (
            <Field
              label={`Cantidad (${item.sellingUnit === "CAJAS" ? "cajas" : (product?.unitOfMeasure ?? "unidad")})`}
              labelClassName={itemLabelClassName}
            >
              <Input
                min="0.001"
                onChange={(event) => onUpdate({ quantity: event.target.value })}
                step="any"
                type="number"
                value={item.quantity}
              />
            </Field>
          )}
          {product?.unitOfMeasure === "UN" && (
            <Field label="Unidad de venta" labelClassName={itemLabelClassName}>
              <select
                aria-label="Unidad de venta del producto"
                className={selectClassName}
                onChange={(event) =>
                  onUpdate({
                    sellingUnit: event.target.value as QuoteSellingUnit,
                    agreedUnitPrice: null,
                    competitorUnitPrice: "",
                    discountPercentage: "",
                  })
                }
                value={item.sellingUnit}
              >
                <option value="UNIDADES">UNIDADES</option>
                {Number.isInteger(product.unitsPerBox) &&
                  (product.unitsPerBox ?? 0) > 0 && (
                    <option value="CAJAS">
                      CAJAS ({product.unitsPerBox} unidades)
                    </option>
                  )}
              </select>
            </Field>
          )}
          <Field
            label="Modalidad de precio"
            labelClassName={itemLabelClassName}
          >
            <select
              className={selectClassName}
              onChange={(event) =>
                onPricingMethodChange(
                  event.target.value as SalesQuotePricingMethod
                )
              }
              value={item.pricingMethod}
            >
              <option value="COMPETITOR">Por precio competencia</option>
              <option value="PERCENTAGE">Por porcentaje</option>
              <option value="LIST_PRICE">Precio lista</option>
            </select>
          </Field>
          {item.pricingMethod === "COMPETITOR" && (
            <Field
              label={`Precio competencia${caseUnitsPerBox ? " por unidad" : ""} (${currency})`}
              labelClassName={itemLabelClassName}
            >
              <Input
                min="0"
                onChange={(event) =>
                  onUpdate({ competitorUnitPrice: event.target.value })
                }
                step="0.000001"
                type="number"
                value={item.competitorUnitPrice}
              />
            </Field>
          )}
          {item.pricingMethod === "PERCENTAGE" && (
            <Field
              label="Porcentaje de descuento (%)"
              labelClassName={itemLabelClassName}
            >
              <Input
                max="100"
                min="0"
                onChange={(event) => onPercentageChange(event.target.value)}
                step="0.01"
                type="number"
                value={item.discountPercentage}
              />
            </Field>
          )}
          <div>
            <p
              className={`${itemLabelClassName} mb-2 text-muted-foreground text-xs`}
            >
              {finalPriceLabel}
              {caseUnitsPerBox ? " por unidad" : ""}
            </p>
            <Input
              aria-label="Precio final editable"
              min="0"
              onChange={(event) => onAgreedPriceChange(event.target.value)}
              placeholder={
                suggestion
                  ? suggestion.agreedUnitPrice.toString()
                  : "Ingresá el precio final"
              }
              step={caseUnitsPerBox ? "any" : "0.01"}
              type="number"
              value={
                item.agreedUnitPrice ??
                suggestion?.agreedUnitPrice.toString() ??
                ""
              }
            />
            {item.pricingMethod === "COMPETITOR" &&
              suggestion?.adjustmentType === "DISCOUNT" && (
                <p className="text-muted-foreground text-xs">
                  Descuento unitario:{" "}
                  {formatCurrency(suggestion.discountAmount, currency)}
                </p>
              )}
            {suggestion?.adjustmentType === "PRICE_OVERRIDE" && (
              <p className="text-muted-foreground text-xs">
                Aumento unitario:{" "}
                {formatCurrency(suggestion.priceIncreaseAmount, currency)}
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <p
              className={`${itemLabelClassName} text-muted-foreground text-xs`}
            >
              Subtotal acordado
            </p>
            <p className="flex h-9 items-center font-semibold text-sm">
              {lineTotal == null ? "—" : formatCurrency(lineTotal, currency)}
            </p>
          </div>
          <Field
            label="Comentario del producto"
            labelClassName={itemLabelClassName}
          >
            <Input
              maxLength={1000}
              onChange={(event) => onUpdate({ comment: event.target.value })}
              placeholder="Opcional"
              value={item.comment}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 md:justify-end">
          <Button
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRemove}
            size="sm"
            type="button"
            variant="outline"
          >
            Quitar producto
          </Button>
          <Button
            className="md:hidden"
            onClick={() => setCollapsed(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Check className="size-4" />
            Listo
          </Button>
        </div>
      </div>
    </div>
  );
}
