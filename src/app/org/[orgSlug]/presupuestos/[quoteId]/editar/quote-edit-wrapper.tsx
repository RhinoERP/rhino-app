"use client";

import {
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  FileImageIcon,
  FilePdfIcon,
} from "@phosphor-icons/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/dist/client/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { QuoteForm } from "@/components/quotes/quote-form";
import { QuoteStatusManager } from "@/components/quotes/quote-status-manager";
import { statusStyles } from "@/components/quotes/quotes-table";
import { ItemExtrasList } from "@/components/shared/item-extras-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";
import type { QuoteDetails } from "@/modules/quotes/actions/get-quote-by-id.action";
import {
  getQuoteVersionsAction,
  type QuoteVersion,
} from "@/modules/quotes/actions/get-quote-versions.action";
import { uploadQuoteFileAction } from "@/modules/quotes/actions/upload-quote-file.action";
import { useEditQuote } from "@/modules/quotes/hooks/use-quote-edit";
import { useQuotePDF } from "@/modules/quotes/hooks/use-quote-pdf";
import type { QuoteFormValues } from "@/modules/quotes/types";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";
import type {
  ItemTaxInput,
  ItemTaxSource,
} from "@/modules/taxes/item-tax-calculations";

function parseDescription(desc: string | null): {
  productName: string;
  talle: string;
  color: string;
} | null {
  if (!desc) {
    return null;
  }
  const lastSepIndex = desc.lastIndexOf(" - ");
  if (lastSepIndex === -1) {
    return null;
  }
  const productName = desc.slice(0, lastSepIndex);
  const variantPart = desc.slice(lastSepIndex + 3);
  const variantSepIndex = variantPart.lastIndexOf(" / ");
  if (variantSepIndex === -1) {
    return null;
  }
  return {
    productName,
    talle: variantPart.slice(0, variantSepIndex),
    color: variantPart.slice(variantSepIndex + 3),
  };
}

type ProductEntry = {
  productId: string;
  productName: string;
  sku?: string;
  brand?: string;
  unitPrice: number;
  variants: Array<{
    talle: string;
    color: string;
    quantity: number;
    productVariantId?: string;
  }>;
  extras: Array<{ description: string; price: number }>;
  totalQuantity: number;
  subtotal: number;
  discountPercentage: number;
  taxes: ItemTaxInput[];
};

function getOrCreateEntry(
  itemsByProduct: Map<string, ProductEntry>,
  productId: string,
  data: {
    productName: string;
    sku: string | undefined;
    brand: string | undefined;
    unitPrice: number;
  }
): ProductEntry {
  let entry = itemsByProduct.get(productId);
  if (!entry) {
    entry = {
      productId,
      ...data,
      variants: [],
      extras: [],
      totalQuantity: 0,
      subtotal: 0,
      discountPercentage: 0,
      taxes: [],
    };
    itemsByProduct.set(productId, entry);
  }
  return entry;
}

const mapItemTaxes = (
  rows: QuoteDetails["quote_items"][number]["quote_item_taxes"]
): ItemTaxInput[] =>
  rows
    .filter((tax) => tax.tax_id !== null && tax.source !== "fallback")
    .map((tax) => ({
      taxId: tax.tax_id as string,
      name: tax.name,
      rate: tax.rate,
      taxCodeSnapshot: tax.tax_code_snapshot,
      source: tax.source as ItemTaxSource,
    }));

const collectFallbackTaxes = (
  items: QuoteDetails["quote_items"]
): ItemTaxInput[] => {
  const seen = new Set<string>();
  const result: ItemTaxInput[] = [];
  for (const item of items) {
    for (const tax of item.quote_item_taxes ?? []) {
      if (
        tax.source !== "fallback" ||
        tax.tax_id === null ||
        seen.has(tax.tax_id)
      ) {
        continue;
      }
      seen.add(tax.tax_id);
      result.push({
        taxId: tax.tax_id as string,
        name: tax.name,
        rate: tax.rate,
        taxCodeSnapshot: tax.tax_code_snapshot,
        source: "fallback",
      });
    }
  }
  return result;
};

const taxesEqual = (a: ItemTaxInput[], b: ItemTaxInput[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  const key = (tax: ItemTaxInput) => `${tax.taxId}:${tax.name}:${tax.rate}`;
  const aKeys = a.map(key).sort();
  const bKeys = b.map(key).sort();
  return aKeys.every((aKey, index) => aKey === bKeys[index]);
};

function processQuoteItem(
  itemsByProduct: Map<string, ProductEntry>,
  item: QuoteDetails["quote_items"][number],
  productMap: Map<string, SaleProduct>
): void {
  const productId = item.product_id ?? "";
  const product = productMap.get(productId);
  const parsed = parseDescription(item.description);
  const productName =
    parsed?.productName ?? product?.name ?? item.description ?? "Producto";
  const talle = parsed?.talle ?? "Único";
  const color = parsed?.color ?? "—";

  const entry = getOrCreateEntry(itemsByProduct, productId, {
    productName,
    sku: product?.sku,
    brand: product?.brand ?? undefined,
    unitPrice: item.unit_price,
  });

  entry.variants.push({
    talle,
    color,
    quantity: item.quantity,
    productVariantId: item.product_variant_id ?? undefined,
  });
  entry.totalQuantity += item.quantity;
  entry.subtotal += item.subtotal;

  const nextDiscount = item.discount_percentage ?? 0;
  const nextTaxes = mapItemTaxes(item.quote_item_taxes ?? []);

  if (entry.variants.length === 1) {
    entry.discountPercentage = nextDiscount;
    entry.taxes = nextTaxes;
  } else if (
    nextDiscount !== entry.discountPercentage ||
    !taxesEqual(nextTaxes, entry.taxes)
  ) {
    // Variantes con descuento/impuestos distintos por fila no se pueden
    // representar a nivel de ítem; se resetean para no persistir nada.
    entry.discountPercentage = 0;
    entry.taxes = [];
  }

  if (item.quote_item_extras?.length > 0 && entry.extras.length === 0) {
    entry.extras = item.quote_item_extras.map((e) => ({
      description: e.description,
      price: e.price,
    }));
  }
}

function buildDefaultValues(
  quote: QuoteDetails,
  products: SaleProduct[],
  customers: Customer[]
): Partial<QuoteFormValues> {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const customer = customers.find((c) => c.id === quote.customer_id);

  const itemsByProduct = new Map<string, ProductEntry>();

  for (const item of quote.quote_items) {
    processQuoteItem(itemsByProduct, item, productMap);
  }

  return {
    customerId: quote.customer_id,
    salesPriceListId: customer?.sales_price_list_id ?? "none",
    targetMarginListId: quote.target_margin_list_id ?? "none",
    currency: quote.currency as "ARS" | "USD",
    exchangeRate: quote.exchange_rate,
    items: Array.from(itemsByProduct.values()),
    notes: quote.observations ?? "",
    purchaseOrderFile: quote.purchase_order_file ?? null,
    designFile: quote.design_file_url ?? null,
    advancePaymentEnabled:
      ((quote as Record<string, unknown>).advance_payment as boolean) ?? false,
    advancePaymentPercentage:
      ((quote as Record<string, unknown>).advance_payment_percentage as
        | number
        | null) ?? null,
    paymentCondition: quote.payment_condition ?? "",
    globalDiscountPercentage: quote.global_discount_percentage ?? 0,
    taxes: collectFallbackTaxes(quote.quote_items),
  };
}

type QuoteEditWrapperProps = {
  orgSlug: string;
  quote: QuoteDetails;
  customers: Customer[];
  products: SaleProduct[];
  salesPriceLists: SalesPriceList[];
  hasProduction: boolean;
};

function VersionHistoryCard({
  versions,
  orgSlug,
}: {
  versions: QuoteVersion[];
  orgSlug: string;
}) {
  if (versions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClockCounterClockwiseIcon className="h-4 w-4" />
          Historial de versiones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {versions.map((v) => (
          <div
            className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
            key={v.id}
          >
            <div>
              <p className="font-medium">{formatDate(v.created_at ?? "")}</p>
              <Badge className="mt-0.5 text-xs" variant="secondary">
                {statusStyles.CANCELLED.label}
              </Badge>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/org/${orgSlug}/presupuestos/${v.id}/editar`}>
                Ver versión
              </Link>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function QuoteDetailCard({
  quote,
  customer,
  totalItems,
}: {
  quote: QuoteDetails;
  customer: QuoteDetails["customers"];
  totalItems: number;
}) {
  const itemsWithExtras = quote.quote_items.map((item) => {
    const extrasTotal = truncateMoney(
      (item.quote_item_extras ?? []).reduce(
        (sum, extra) => sum + extra.price,
        0
      )
    );
    const gross = truncateMoney(
      (item.subtotal ?? 0) + extrasTotal * item.quantity
    );
    const discount = truncateMoney(item.discount_amount ?? 0);
    return {
      gross,
      discount,
      net: truncateMoney(Math.max(0, gross - discount)),
    };
  });
  const itemsGrossTotal = truncateMoney(
    itemsWithExtras.reduce((sum, entry) => sum + entry.gross, 0)
  );
  const lineDiscountTotal = truncateMoney(
    itemsWithExtras.reduce((sum, entry) => sum + entry.discount, 0)
  );
  const subtotal = truncateMoney(
    quote.sub_total ?? Math.max(0, itemsGrossTotal - lineDiscountTotal)
  );
  const globalDiscountAmount = truncateMoney(quote.global_discount_amount ?? 0);
  const total = truncateMoney(quote.total_amount ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Detalle del presupuesto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Cliente</p>
            <p className="mt-0.5 font-medium">
              {customer?.fantasy_name || customer?.business_name || "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Total</p>
            <p className="mt-0.5 font-semibold text-lg">
              {formatCurrency(quote.total_amount, quote.currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Moneda</p>
            <p className="mt-0.5 font-medium">{quote.currency}</p>
          </div>
          {quote.exchange_rate != null && (
            <div>
              <p className="text-muted-foreground text-xs">Cotización</p>
              <p className="mt-0.5 font-medium">
                {formatCurrency(quote.exchange_rate, "ARS")}
              </p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs">Condición de pago</p>
            <p className="mt-0.5 font-medium">
              {quote.payment_condition || "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">CUIT</p>
            <p className="mt-0.5 font-medium">{customer?.cuit || "—"}</p>
          </div>
        </div>

        {((quote as Record<string, unknown>).advance_payment as boolean) && (
          <div>
            <p className="text-muted-foreground text-xs">Pago anticipado</p>
            <p className="mt-0.5 font-medium">
              {
                (quote as Record<string, unknown>)
                  .advance_payment_percentage as number
              }
              %
            </p>
          </div>
        )}

        {quote.observations && (
          <div>
            <p className="text-muted-foreground text-xs">Observaciones</p>
            <p className="mt-0.5 text-sm">{quote.observations}</p>
          </div>
        )}

        {quote.purchase_order_file && (
          <div>
            <p className="text-muted-foreground text-xs">Orden de compra</p>
            <Button asChild className="mt-1" size="sm" variant="outline">
              <Link href={quote.purchase_order_file} target="_blank">
                <FilePdfIcon className="mr-1.5 h-4 w-4 text-destructive" />
                Ver orden de compra
              </Link>
            </Button>
          </div>
        )}

        {quote.design_file_url && (
          <div>
            <p className="text-muted-foreground text-xs">Boceto / Diseño</p>
            <Button asChild className="mt-1" size="sm" variant="outline">
              <Link href={quote.design_file_url} target="_blank">
                <FileImageIcon className="mr-1.5 h-4 w-4 text-primary" />
                Ver boceto
              </Link>
            </Button>
          </div>
        )}

        <div>
          <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Productos ({totalItems} unidades)
          </p>
          <div className="space-y-2">
            {quote.quote_items.map((item) => {
              const extrasTotal = truncateMoney(
                (item.quote_item_extras ?? []).reduce(
                  (sum, extra) => sum + extra.price,
                  0
                )
              );
              const displaySubtotal = truncateMoney(
                (item.subtotal ?? 0) + extrasTotal * item.quantity
              );
              return (
                <div
                  className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <span>{item.description || "Producto"}</span>
                    <ItemExtrasList
                      currency={quote.currency}
                      extras={item.quote_item_extras}
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
                    <span>x{item.quantity}</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(displaySubtotal, quote.currency)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5 rounded-md bg-muted/40 px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">
              {formatCurrency(subtotal, quote.currency)}
            </span>
          </div>
          {lineDiscountTotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Descuentos</span>
              <span className="font-medium">
                -{formatCurrency(lineDiscountTotal, quote.currency)}
              </span>
            </div>
          )}
          {globalDiscountAmount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Descuento global
                {quote.global_discount_percentage
                  ? ` (${quote.global_discount_percentage.toFixed(1)}%)`
                  : ""}
              </span>
              <span className="font-medium">
                -{formatCurrency(globalDiscountAmount, quote.currency)}
              </span>
            </div>
          )}
          {(quote.quote_taxes ?? []).map((tax) => (
            <div className="flex items-center justify-between" key={tax.id}>
              <span className="text-muted-foreground">
                {tax.name}
                {tax.rate ? ` (${tax.rate.toFixed(1)}%)` : ""}
              </span>
              <span className="font-medium">
                {formatCurrency(tax.tax_amount, quote.currency)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-1.5">
            <span className="font-medium">Total</span>
            <span className="font-semibold">
              {formatCurrency(total, quote.currency)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function QuoteEditWrapper({
  orgSlug,
  quote,
  customers,
  products,
  salesPriceLists,
  hasProduction,
}: QuoteEditWrapperProps) {
  const { editQuote, isPending } = useEditQuote(orgSlug, quote.id);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDesignFile, setSelectedDesignFile] = useState<File | null>(
    null
  );
  const [versions, setVersions] = useState<QuoteVersion[]>([]);

  const { generateAndDownloadPDF, isGenerating } = useQuotePDF({
    orgSlug,
    quoteId: quote.id,
    customerName:
      quote.customers?.fantasy_name ||
      quote.customers?.business_name ||
      "Cliente",
    createdAt: quote.created_at,
  });

  useEffect(() => {
    if (quote.status !== "CANCELLED") {
      getQuoteVersionsAction(orgSlug, quote.id).then(setVersions);
    }
  }, [quote.id, quote.status, orgSlug]);

  const { customer, totalItems, defaultValues } = useMemo(() => {
    const customerQuote = quote.customers;
    const quoteItems = quote.quote_items.reduce(
      (sum, i) => sum + i.quantity,
      0
    );
    const quoteDefaultValues = buildDefaultValues(quote, products, customers);
    return {
      customer: customerQuote,
      totalItems: quoteItems,
      defaultValues: quoteDefaultValues,
    };
  }, [quote, products, customers]);

  async function uploadReplacing(
    file: File,
    type: "purchase_order" | "design",
    oldFileUrl: string | null
  ): Promise<string | null> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("orgSlug", orgSlug);
    formData.append("quoteId", quote.id);
    formData.append("type", type);
    if (oldFileUrl) {
      formData.append("oldFileUrl", oldFileUrl);
    }

    const uploadResult = await uploadQuoteFileAction(formData);
    if (!(uploadResult.success && uploadResult.url)) {
      const label = type === "purchase_order" ? "orden de compra" : "boceto";
      toast.error(uploadResult.error ?? `Error al subir la ${label}`);
      return null;
    }
    return uploadResult.url;
  }

  const handleSubmit = async (values: QuoteFormValues) => {
    let purchaseOrderFile = values.purchaseOrderFile ?? null;
    let designFileUrl = values.designFile ?? null;

    if (selectedFile) {
      const url = await uploadReplacing(
        selectedFile,
        "purchase_order",
        quote.purchase_order_file
      );
      if (!url) {
        return;
      }
      purchaseOrderFile = url;
    }

    if (selectedDesignFile) {
      const url = await uploadReplacing(
        selectedDesignFile,
        "design",
        quote.design_file_url
      );
      if (!url) {
        return;
      }
      designFileUrl = url;
    }

    try {
      await editQuote.mutateAsync({
        ...values,
        purchaseOrderFile,
        designFile: designFileUrl,
      });
      setIsEditing(false);
      setSelectedFile(null);
      setSelectedDesignFile(null);

      const updatedVersions = await getQuoteVersionsAction(orgSlug, quote.id);
      setVersions(updatedVersions);
    } catch (error) {
      throw new Error(
        `Error al editar el presupuesto. Por favor, intenta nuevamente. Error: ${error}`
      );
    }
  };

  if (!isEditing) {
    return (
      <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
        <div className="flex items-center gap-4">
          <Button asChild size="icon" variant="ghost">
            <Link href={`/org/${orgSlug}/listas-de-presupuestos`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex flex-1 items-center justify-between">
            <div>
              <h1 className="font-bold text-2xl">Presupuesto</h1>
              <p className="text-muted-foreground text-sm">
                {customer?.fantasy_name || customer?.business_name || "Cliente"}{" "}
                · {formatDate(quote.created_at ?? "")}
              </p>
            </div>
            <Button
              disabled={isGenerating}
              onClick={generateAndDownloadPDF}
              variant="outline"
            >
              <DownloadSimpleIcon className="mr-1.5 h-4 w-4" />
              {isGenerating ? "Generando..." : "Descargar presupuesto"}
            </Button>
          </div>
        </div>

        {quote.status === "CANCELLED" && quote.parent_quote_id && (
          <div className="rounded-lg border border-gray-500/20 bg-gray-500/10 px-4 py-3">
            <p className="text-muted-foreground text-sm">
              Esta es una versión cancelada del presupuesto.{" "}
              <Link
                className="underline"
                href={`/org/${orgSlug}/presupuestos/${quote.parent_quote_id}/editar`}
              >
                Ver presupuesto actualizado
              </Link>
            </p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-4 md:col-span-2">
            <QuoteDetailCard
              customer={customer}
              quote={quote}
              totalItems={totalItems}
            />

            {(quote.status === "DRAFT" || quote.status === "SENT") && (
              <Button onClick={() => setIsEditing(true)}>
                Editar presupuesto
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {quote.status !== "CANCELLED" && (
              <QuoteStatusManager
                customerEmail={customer?.email ?? null}
                customerName={
                  customer?.fantasy_name || customer?.business_name || "Cliente"
                }
                hasProduction={hasProduction}
                orgSlug={orgSlug}
                quote={quote}
              />
            )}

            <VersionHistoryCard orgSlug={orgSlug} versions={versions} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl">Editar Presupuesto</h1>
        <Button onClick={() => setIsEditing(false)} variant="outline">
          Cancelar
        </Button>
      </div>

      <QuoteForm
        customers={customers}
        defaultValues={defaultValues}
        isSubmitting={isPending}
        onCancel={() => setIsEditing(false)}
        onDesignFileSelect={setSelectedDesignFile}
        onFileSelect={setSelectedFile}
        onSubmit={handleSubmit}
        orgSlug={orgSlug}
        products={products}
        salesPriceLists={salesPriceLists}
        selectedDesignFile={selectedDesignFile}
        selectedFile={selectedFile}
        submitLabel="Guardar Cambios"
      />
    </div>
  );
}
