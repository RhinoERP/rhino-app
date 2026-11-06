"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { truncateMoney, truncateToDecimals } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";
import {
  calculateSalePrice,
  type SalePriceAdjustment,
} from "@/modules/price-levels/service/price-calculator";
import type { PriceLevelWithStatus } from "@/modules/price-levels/types";
import { convertPriceToQuoteCurrency } from "@/modules/quotes/utils/currency-conversion";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";
import { createSalesQuoteRequestAction } from "@/modules/sales-quote-requests/actions/create-sales-quote-request.action";
import { updateSalesQuoteRequestAction } from "@/modules/sales-quote-requests/actions/update-sales-quote-request.action";
import {
  calculateCompetitivePriceSuggestion,
  type SalesQuotePricingMethod,
} from "@/modules/sales-quote-requests/competitive-pricing";
import type { SalesQuoteRequestEditValues } from "@/modules/sales-quote-requests/service/my-sales-quote-requests.service";
import type { CreateSalesQuoteRequestInput } from "@/modules/sales-quote-requests/service/sales-quote-requests.service";

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

type SalesQuoteRequestFormProps = {
  orgSlug: string;
  customers: Customer[];
  products: SaleProduct[];
  priceLevels: PriceLevelWithStatus[];
  salesPriceLists: SalesPriceList[];
  variants: ProductVariantOption[];
  requestId?: string;
  initialValues?: SalesQuoteRequestEditValues;
};

const selectClassName =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";

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

  const salePrice = calculateSalePrice({
    basePrice: product.price,
    costPrice: product.costPrice,
    level: priceLevel,
    adjustments: priceAdjustments,
  }).price;
  const baseUnitPrice = convertPriceToQuoteCurrency(
    salePrice,
    product.currency,
    currency,
    exchangeRate
  );
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
    validSelectedPrice
  );

  return { item, product, baseUnitPrice, suggestion };
}

function calculateLineSuggestion(
  item: RequestItemDraft,
  baseUnitPrice: number,
  selectedAgreedPrice: number | undefined
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
      selectedAgreedPrice
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
    const percentagePrice = truncateMoney(
      baseUnitPrice * (1 - percentage / 100)
    );
    return calculateCompetitivePriceSuggestion(
      baseUnitPrice,
      baseUnitPrice,
      selectedAgreedPrice ?? percentagePrice
    );
  }

  return calculateCompetitivePriceSuggestion(
    baseUnitPrice,
    baseUnitPrice,
    selectedAgreedPrice ?? baseUnitPrice
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
    items: params.items.map((item) => ({
      productId: item.productId,
      productVariantId: item.productVariantId,
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: coordinates seller form state and pricing preview.
export function SalesQuoteRequestForm({
  orgSlug,
  customers,
  products,
  priceLevels,
  salesPriceLists,
  variants,
  requestId,
  initialValues,
}: SalesQuoteRequestFormProps) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(initialValues?.customerId ?? "");
  const [customerSegment, setCustomerSegment] = useState<
    "ACTIVE" | "NEW" | "REACTIVATED"
  >(initialValues?.customerSegment ?? "ACTIVE");
  const [sellerZone, setSellerZone] = useState(initialValues?.sellerZone ?? "");
  const [currency, setCurrency] = useState<"ARS" | "USD">(
    initialValues?.currency ?? "ARS"
  );
  const [exchangeRate, setExchangeRate] = useState(
    initialValues?.exchangeRate?.toString() ?? ""
  );
  const [priceLevelId, setPriceLevelId] = useState(
    initialValues?.priceLevelId ?? ""
  );
  const [salesPriceListId, setSalesPriceListId] = useState(
    initialValues?.salesPriceListId ?? ""
  );
  const [paymentMethod, setPaymentMethod] = useState(
    initialValues?.paymentMethod ?? ""
  );
  const [paymentTerm, setPaymentTerm] = useState(
    initialValues?.paymentTerm ?? ""
  );
  const [invoiceType, setInvoiceType] = useState(
    initialValues?.invoiceType ?? "NOTA_DE_VENTA"
  );
  const [observations, setObservations] = useState(
    initialValues?.observations ?? ""
  );
  const [items, setItems] = useState<RequestItemDraft[]>(
    (initialValues?.items ?? []).map((item, index) => ({
      id: `initial-${index}`,
      productId: item.productId,
      productVariantId: item.productVariantId,
      quantity: item.quantity.toString(),
      pricingMethod: item.pricingMethod,
      competitorUnitPrice: item.competitorUnitPrice.toString(),
      discountPercentage: item.discountPercentage.toString(),
      agreedUnitPrice: item.agreedUnitPrice.toString(),
      comment: item.comment,
    }))
  );
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isAddingItem, startAddingItem] = useTransition();
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );
  const selectedProduct = products.find(
    (product) => product.id === selectedProductId
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
    setCreatedRequestId(null);
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
        })
      ),
    [
      currency,
      exchangeRateNumber,
      items,
      priceAdjustments,
      priceLevel,
      products,
    ]
  );

  const subtotal = lineViews.reduce((sum, line) => {
    if (!line.suggestion) {
      return sum;
    }
    const quantity = Number(line.item.quantity);
    return Number.isFinite(quantity) && quantity > 0
      ? sum + line.suggestion.agreedUnitPrice * quantity
      : sum;
  }, 0);

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
          quantity: "1",
          pricingMethod: "COMPETITOR",
          competitorUnitPrice: "",
          discountPercentage: "",
          agreedUnitPrice: null,
          comment: "",
        },
      ]);
      setSelectedProductId("");
      setSelectedVariantId("");
      setCreatedRequestId(null);
    });
  };

  const updateItem = (
    id: string,
    values: Partial<Omit<RequestItemDraft, "id">>
  ) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...values } : item))
    );
    setCreatedRequestId(null);
  };

  const updatePricingMethod = (
    itemId: string,
    method: SalesQuotePricingMethod,
    baseUnitPrice: number
  ) => {
    updateItem(itemId, {
      pricingMethod: method,
      competitorUnitPrice: "",
      discountPercentage: method === "PERCENTAGE" ? "0" : "",
      agreedUnitPrice:
        method === "COMPETITOR"
          ? null
          : truncateMoney(baseUnitPrice).toString(),
    });
  };

  const updatePercentage = (
    itemId: string,
    baseUnitPrice: number,
    value: string
  ) => {
    const percentage = Number(value);
    const agreedUnitPrice =
      value.trim() !== "" &&
      Number.isFinite(percentage) &&
      percentage >= 0 &&
      percentage <= 100
        ? truncateMoney(baseUnitPrice * (1 - percentage / 100)).toString()
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

  const handleSubmit = () => {
    if (!selectedCustomer) {
      toast.error("Seleccioná un cliente");
      return;
    }
    if (!sellerZone.trim()) {
      toast.error("Ingresá la zona del vendedor");
      return;
    }
    if (items.length === 0) {
      toast.error("Agregá al menos un producto");
      return;
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
      parsedItems.some(
        (item) =>
          !item.pricingValid ||
          (item.pricingMethod === "COMPETITOR" &&
            item.competitorUnitPrice.trim() === "") ||
          (item.pricingMethod === "PERCENTAGE" &&
            (item.discountPercentage.trim() === "" ||
              Number(item.discountPercentage) < 0 ||
              Number(item.discountPercentage) > 100 ||
              item.agreedPriceNumber > item.baseUnitPriceNumber)) ||
          (item.agreedUnitPrice != null &&
            item.agreedUnitPrice.trim() === "") ||
          !Number.isFinite(item.agreedPriceNumber) ||
          item.agreedPriceNumber < 0 ||
          !Number.isFinite(item.quantityNumber) ||
          item.quantityNumber <= 0 ||
          !Number.isFinite(item.competitorPriceNumber) ||
          item.competitorPriceNumber < 0
      )
    ) {
      toast.error("Revisá las cantidades y precios de competencia");
      return;
    }

    startTransition(async () => {
      const values = buildRequestValues({
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
        items: parsedItems,
        products,
      });
      const result = await submitRequest(requestId, values);
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

      setCreatedRequestId(result.requestId);
      setItems([]);
      setObservations("");
      toast.success("Solicitud enviada a aprobación");
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
      <div className="min-w-0 flex-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos comerciales</CardTitle>
            <CardDescription>
              {requestId
                ? "Al guardar, la cotización vuelve a la bandeja de aprobación."
                : "La solicitud se enviará a un administrador para su aprobación."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente">
              <select
                className={selectClassName}
                onChange={(event) => handleCustomerChange(event.target.value)}
                value={customerId}
              >
                <option value="">Seleccionar cliente</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customerName(customer)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Segmento del cliente">
              <select
                className={selectClassName}
                onChange={(event) =>
                  setCustomerSegment(
                    event.target.value as typeof customerSegment
                  )
                }
                value={customerSegment}
              >
                <option value="ACTIVE">Activo</option>
                <option value="NEW">Nuevo</option>
                <option value="REACTIVATED">Reactivado</option>
              </select>
            </Field>
            <Field label="Zona del vendedor">
              <Input
                maxLength={120}
                onChange={(event) => setSellerZone(event.target.value)}
                placeholder="Ej.: Zona 6"
                value={sellerZone}
              />
            </Field>
            <Field label="Moneda de la solicitud">
              <select
                className={selectClassName}
                onChange={(event) =>
                  setCurrency(event.target.value as "ARS" | "USD")
                }
                value={currency}
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
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
            <Field label="Nivel de precio">
              <select
                className={selectClassName}
                onChange={(event) => setPriceLevelId(event.target.value)}
                value={priceLevelId}
              >
                <option value="">Precio base del producto</option>
                {priceLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </Field>
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
            <CardTitle>Productos</CardTitle>
            <CardDescription>
              Elegí una modalidad de precio para cada producto y completá sus
              valores.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="sales-quote-product-picker">
              <div className="min-w-0">
                <Field label="Producto">
                  <select
                    className={`${selectClassName} min-w-0 text-ellipsis`}
                    onChange={(event) => {
                      setSelectedProductId(event.target.value);
                      setSelectedVariantId("");
                    }}
                    value={selectedProductId}
                  >
                    <option value="">Seleccionar producto</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.sku} ·{" "}
                        {formatCurrency(product.price, product.currency)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field
                label={
                  selectedProduct?.hasVariants ? "Variante" : "Unidad de venta"
                }
              >
                {selectedProduct?.hasVariants ? (
                  <select
                    className={selectClassName}
                    onChange={(event) =>
                      setSelectedVariantId(event.target.value)
                    }
                    value={selectedVariantId}
                  >
                    <option value="">Seleccionar variante</option>
                    {variants
                      .filter(
                        (variant) => variant.productId === selectedProduct.id
                      )
                      .map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.color} / {variant.talle}
                        </option>
                      ))}
                  </select>
                ) : (
                  <div className="flex h-9 min-w-0 items-center rounded-md border bg-muted/30 px-3 text-muted-foreground text-sm">
                    {selectedProduct?.unitOfMeasure ?? "Seleccioná un producto"}
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
                <span>Subtotal propuesto</span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>
              <p className="text-muted-foreground text-xs">
                Los impuestos se estiman usando los impuestos asignados a cada
                producto.
              </p>
              {createdRequestId && (
                <div className="rounded-md border border-emerald-600/30 bg-emerald-600/5 p-3 text-sm">
                  Solicitud enviada. Referencia: {createdRequestId.slice(0, 8)}
                </div>
              )}
              <Button
                className="w-full"
                disabled={isPending || items.length === 0 || !customerId}
                onClick={handleSubmit}
                type="button"
              >
                {isPending && <Spinner className="mr-2" />}
                {submitLabel}
              </Button>
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
  const itemLabelClassName = "flex h-12 items-end overflow-hidden leading-5";
  const quantity = Number(item.quantity);
  const lineTotal =
    suggestion && Number.isFinite(quantity) && quantity > 0
      ? suggestion.agreedUnitPrice * quantity
      : null;
  const adjustmentLabel = getAdjustmentLabel(suggestion);
  let finalPriceLabel = `Precio lista (${currency})`;
  if (item.pricingMethod === "COMPETITOR") {
    finalPriceLabel = adjustmentLabel;
  } else if (item.pricingMethod === "PERCENTAGE") {
    finalPriceLabel = `Precio final (${currency})`;
  }

  return (
    <div className="min-w-0 rounded-lg border p-3 sm:p-4">
      <div className="mb-4 flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="min-w-0">
          <p className="break-words font-medium">
            {product?.name ?? "Producto"}
            {variant ? ` · ${variant.color} / ${variant.talle}` : ""}
          </p>
          <p className="text-muted-foreground text-xs">
            {product?.sku} · Precio base cotizado:{" "}
            {formatCurrency(baseUnitPrice, currency)}
          </p>
        </div>
        <Button onClick={onRemove} size="sm" type="button" variant="ghost">
          Quitar
        </Button>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field
          label={`Cantidad (${product?.unitOfMeasure ?? "unidad"})`}
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
        <Field label="Modalidad de precio" labelClassName={itemLabelClassName}>
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
            label={`Precio competencia (${currency})`}
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
            step="0.01"
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
          <p className={`${itemLabelClassName} text-muted-foreground text-xs`}>
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
    </div>
  );
}
