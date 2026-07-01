"use client";

import {
  ClockCounterClockwiseIcon,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";
import type { QuoteDetails } from "@/modules/quotes/actions/get-quote-by-id.action";
import {
  getQuoteVersionsAction,
  type QuoteVersion,
} from "@/modules/quotes/actions/get-quote-versions.action";
import { uploadQuoteFileAction } from "@/modules/quotes/actions/upload-quote-file.action";
import { useEditQuote } from "@/modules/quotes/hooks/use-quote-edit";
import type { QuoteFormValues } from "@/modules/quotes/types";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";

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
};

function getOrCreateEntry(
  itemsByProduct: Map<string, ProductEntry>,
  productId: string,
  data: { productName: string; sku: string | undefined; unitPrice: number }
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
    };
    itemsByProduct.set(productId, entry);
  }
  return entry;
}

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
    currency: quote.currency as "ARS" | "USD",
    exchangeRate: quote.exchange_rate,
    items: Array.from(itemsByProduct.values()),
    notes: quote.observations ?? "",
    purchaseOrderFile: quote.purchase_order_file ?? null,
    designFile: quote.design_file_url ?? null,
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
                Descargar orden de compra
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
            {quote.quote_items.map((item) => (
              <div
                className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                key={item.id}
              >
                <span>{item.description || "Producto"}</span>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>x{item.quantity}</span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(item.subtotal, quote.currency)}
                  </span>
                </div>
              </div>
            ))}
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
          <div className="flex items-center gap-4">
            <Button asChild size="icon" variant="ghost">
              <Link href={`/org/${orgSlug}/listas-de-presupuestos`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div>
            <h1 className="font-bold text-2xl">Presupuesto</h1>
            <p className="text-muted-foreground text-sm">
              {customer?.fantasy_name || customer?.business_name || "Cliente"} ·{" "}
              {formatDate(quote.created_at ?? "")}
            </p>
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
