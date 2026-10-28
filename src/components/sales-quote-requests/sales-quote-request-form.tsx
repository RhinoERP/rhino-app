"use client";

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
import { calculateCompetitivePriceSuggestion } from "@/modules/sales-quote-requests/competitive-pricing";

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
  competitorUnitPrice: string;
  comment: string;
};

type SalesQuoteRequestFormProps = {
  orgSlug: string;
  customers: Customer[];
  products: SaleProduct[];
  priceLevels: PriceLevelWithStatus[];
  salesPriceLists: SalesPriceList[];
  variants: ProductVariantOption[];
};

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function customerName(customer: Customer): string {
  return customer.fantasy_name || customer.business_name || "Cliente";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: coordinates seller form state and pricing preview.
export function SalesQuoteRequestForm({
  orgSlug,
  customers,
  products,
  priceLevels,
  salesPriceLists,
  variants,
}: SalesQuoteRequestFormProps) {
  const [customerId, setCustomerId] = useState("");
  const [customerSegment, setCustomerSegment] = useState<
    "ACTIVE" | "NEW" | "REACTIVATED"
  >("ACTIVE");
  const [sellerZone, setSellerZone] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [exchangeRate, setExchangeRate] = useState("");
  const [priceLevelId, setPriceLevelId] = useState("");
  const [salesPriceListId, setSalesPriceListId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [invoiceType, setInvoiceType] = useState("NOTA_DE_VENTA");
  const [observations, setObservations] = useState("");
  const [items, setItems] = useState<RequestItemDraft[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [isPending, startTransition] = useTransition();
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
      items.map((item) => {
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
          exchangeRateNumber
        );
        const competitorPrice = Number(item.competitorUnitPrice);
        const suggestion =
          item.competitorUnitPrice.trim() !== "" &&
          Number.isFinite(competitorPrice) &&
          competitorPrice >= 0
            ? calculateCompetitivePriceSuggestion(
                baseUnitPrice,
                competitorPrice
              )
            : null;
        return { item, product, baseUnitPrice, suggestion };
      }),
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
    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        productId: selectedProduct.id,
        productVariantId: selectedProduct.hasVariants
          ? selectedVariantId
          : null,
        quantity: "1",
        competitorUnitPrice: "",
        comment: "",
      },
    ]);
    setSelectedProductId("");
    setSelectedVariantId("");
    setCreatedRequestId(null);
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

    const parsedItems = items.map((item) => ({
      ...item,
      quantityNumber: Number(item.quantity),
      competitorPriceNumber: Number(item.competitorUnitPrice),
    }));
    if (
      parsedItems.some(
        (item) =>
          item.competitorUnitPrice.trim() === "" ||
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
      const result = await createSalesQuoteRequestAction({
        orgSlug,
        customerId,
        customerSegment,
        sellerZone: sellerZone.trim(),
        currency,
        exchangeRate:
          Number.isFinite(exchangeRateNumber) &&
          exchangeRateNumber > 0 &&
          (currency !== "ARS" ||
            parsedItems.some((line) => {
              const product = products.find(
                (entry) => entry.id === line.productId
              );
              return product?.currency !== currency;
            }))
            ? exchangeRateNumber
            : null,
        priceLevelId: priceLevelId || null,
        salesPriceListId: salesPriceListId || null,
        paymentMethod: paymentMethod.trim(),
        paymentTerm: paymentTerm.trim(),
        invoiceType: invoiceType as
          | "NOTA_DE_VENTA"
          | "FACTURA_A"
          | "FACTURA_A_RETENCION"
          | "FACTURA_B"
          | "FACTURA_C"
          | "FACTURA_E",
        observations: observations.trim(),
        items: parsedItems.map((item) => ({
          productId: item.productId,
          productVariantId: item.productVariantId,
          quantity: item.quantityNumber,
          competitorUnitPrice: item.competitorPriceNumber,
          comment: item.comment,
        })),
      });

      if (!result.success) {
        toast.error(result.error);
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

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos comerciales</CardTitle>
            <CardDescription>
              La solicitud se enviará a un administrador para su aprobación.
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
              El precio acordado se sugiere igualando a la competencia.
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
                  !selectedProduct ||
                  (selectedProduct.hasVariants && !selectedVariantId)
                }
                onClick={handleAddItem}
                type="button"
                variant="outline"
              >
                Agregar producto
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

      <div className="w-full lg:w-80 lg:max-w-xs xl:max-w-sm">
        <div className="sticky top-6 space-y-4">
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
                {isPending ? "Enviando..." : "Enviar a aprobación"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">{label}</p>
      {children}
    </div>
  );
}

function RequestItemCard({
  item,
  product,
  variant,
  baseUnitPrice,
  suggestion,
  currency,
  onUpdate,
  onRemove,
}: {
  item: RequestItemDraft;
  product: SaleProduct | null;
  variant: ProductVariantOption | undefined;
  baseUnitPrice: number;
  suggestion: ReturnType<typeof calculateCompetitivePriceSuggestion> | null;
  currency: string;
  onUpdate: (values: Partial<Omit<RequestItemDraft, "id">>) => void;
  onRemove: () => void;
}) {
  const quantity = Number(item.quantity);
  const lineTotal =
    suggestion && Number.isFinite(quantity) && quantity > 0
      ? suggestion.agreedUnitPrice * quantity
      : null;
  let adjustmentLabel = "Ajuste sugerido";
  if (suggestion?.adjustmentType === "DISCOUNT") {
    adjustmentLabel = `Descuento sugerido: ${suggestion.discountPercentage}%`;
  } else if (suggestion?.adjustmentType === "PRICE_OVERRIDE") {
    adjustmentLabel = "Ajuste de precio al alza";
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={`Cantidad (${product?.unitOfMeasure ?? "unidad"})`}>
          <Input
            min="0.001"
            onChange={(event) => onUpdate({ quantity: event.target.value })}
            step="any"
            type="number"
            value={item.quantity}
          />
        </Field>
        <Field label={`Precio competencia (${currency})`}>
          <Input
            min="0"
            onChange={(event) =>
              onUpdate({ competitorUnitPrice: event.target.value })
            }
            step="0.01"
            type="number"
            value={item.competitorUnitPrice}
          />
        </Field>
        <div>
          <p className="mb-2 text-muted-foreground text-xs">
            {adjustmentLabel}
          </p>
          <p className="font-medium text-sm">
            {suggestion
              ? formatCurrency(suggestion.agreedUnitPrice, currency)
              : "Ingresá el precio de competencia"}
          </p>
          {suggestion?.adjustmentType === "DISCOUNT" && (
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
        <div>
          <p className="mb-2 text-muted-foreground text-xs">
            Subtotal acordado
          </p>
          <p className="font-semibold text-sm">
            {lineTotal == null ? "—" : formatCurrency(lineTotal, currency)}
          </p>
        </div>
        <Field label="Comentario del producto">
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
