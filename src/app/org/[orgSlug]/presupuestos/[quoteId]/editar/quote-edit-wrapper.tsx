"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { QuoteForm } from "@/components/quotes/quote-form";
import { QuoteStatusManager } from "@/components/quotes/quote-status-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";
import type { QuoteDetails } from "@/modules/quotes/actions/get-quote-by-id.action";
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

function buildDefaultValues(
  quote: QuoteDetails,
  products: SaleProduct[],
  customers: Customer[]
): Partial<QuoteFormValues> {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const customer = customers.find((c) => c.id === quote.customer_id);

  const itemsByProduct = new Map<
    string,
    {
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
    }
  >();

  for (const item of quote.quote_items) {
    const productId = item.product_id ?? "";
    const product = productMap.get(productId);

    const parsed = parseDescription(item.description);
    const productName =
      parsed?.productName ?? product?.name ?? item.description ?? "Producto";
    const talle = parsed?.talle ?? "Único";
    const color = parsed?.color ?? "—";

    if (!itemsByProduct.has(productId)) {
      itemsByProduct.set(productId, {
        productId,
        productName,
        sku: product?.sku,
        unitPrice: item.unit_price,
        variants: [],
        extras: [],
        totalQuantity: 0,
        subtotal: 0,
      });
    }

    const entry = itemsByProduct.get(productId);
    if (!entry) {
      continue;
    }
    entry.unitPrice = item.unit_price;
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

  return {
    customerId: quote.customer_id,
    salesPriceListId: customer?.sales_price_list_id ?? "",
    currency: quote.currency as "ARS" | "USD",
    items: Array.from(itemsByProduct.values()),
    notes: quote.observations ?? "",
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

export function QuoteEditWrapper({
  orgSlug,
  quote,
  customers,
  products,
  salesPriceLists,
  hasProduction,
}: QuoteEditWrapperProps) {
  const router = useRouter();
  const { editQuote, isPending } = useEditQuote(orgSlug, quote.id);
  const [isEditing, setIsEditing] = useState(false);

  const customer = quote.customers;
  const totalItems = quote.quote_items.reduce((sum, i) => sum + i.quantity, 0);
  const defaultValues = buildDefaultValues(quote, products, customers);

  const handleSubmit = async (values: QuoteFormValues) => {
    await editQuote.mutateAsync(values);
    setIsEditing(false);
    router.refresh();
  };

  if (!isEditing) {
    return (
      <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-bold text-2xl">Presupuesto</h1>
            <p className="text-muted-foreground text-sm">
              {customer?.fantasy_name || customer?.business_name || "Cliente"} ·{" "}
              {formatDate(quote.created_at ?? "")}
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-4 md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Detalle del presupuesto
                </CardTitle>
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
                  <div>
                    <p className="text-muted-foreground text-xs">
                      Condición de pago
                    </p>
                    <p className="mt-0.5 font-medium">
                      {quote.payment_condition || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">CUIT</p>
                    <p className="mt-0.5 font-medium">
                      {customer?.cuit || "—"}
                    </p>
                  </div>
                </div>

                {quote.observations && (
                  <div>
                    <p className="text-muted-foreground text-xs">
                      Observaciones
                    </p>
                    <p className="mt-0.5 text-sm">{quote.observations}</p>
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

            {(quote.status === "DRAFT" || quote.status === "SENT") && (
              <Button onClick={() => setIsEditing(true)}>
                Editar presupuesto
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <QuoteStatusManager
              customerEmail={customer?.email ?? null}
              customerName={
                customer?.fantasy_name || customer?.business_name || "Cliente"
              }
              hasProduction={hasProduction}
              orgSlug={orgSlug}
              quote={quote}
            />
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
        onSubmit={handleSubmit}
        orgSlug={orgSlug}
        products={products}
        salesPriceLists={salesPriceLists}
        submitLabel="Guardar Cambios"
      />
    </div>
  );
}
